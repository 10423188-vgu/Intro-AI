import os
from pathlib import Path

import nest_asyncio
from lightrag import LightRAG, QueryParam
from lightrag.utils import EmbeddingFunc
from lightrag.llm.openai import openai_complete_if_cache
from lightrag.kg.shared_storage import initialize_share_data, initialize_pipeline_status
from dotenv import load_dotenv
from sentence_transformers import SentenceTransformer

nest_asyncio.apply()

_PROJECT_ROOT = Path(__file__).parent.parent
load_dotenv(_PROJECT_ROOT / ".env")

_st_model = None

def _get_st_model():
    global _st_model
    if _st_model is None:
        print("Loading embedding model (first time only)...")
        _st_model = SentenceTransformer("all-MiniLM-L6-v2")
    return _st_model


async def groq_llm_complete(prompt, system_prompt=None, history_messages=[], **kwargs):
    kwargs.pop("keyword_extraction", None)
    return await openai_complete_if_cache(
        "llama-3.3-70b-versatile",
        prompt,
        system_prompt=system_prompt,
        history_messages=history_messages,
        api_key=os.getenv("GROQ_API_KEY"),
        base_url="https://api.groq.com/openai/v1",
        **kwargs
    )


async def local_embed(texts):
    model = _get_st_model()
    return model.encode(texts, convert_to_numpy=True)


_embedding_func = EmbeddingFunc(
    embedding_dim=384,
    max_token_size=512,
    func=local_embed
)


async def initialize_rag(working_dir: str = None) -> LightRAG:
    if working_dir is None:
        rag_path = os.getenv("RAG_STORAGE_PATH", "rag_storage")
        working_dir = str(_PROJECT_ROOT / rag_path) if not os.path.isabs(rag_path) else rag_path
    os.makedirs(working_dir, exist_ok=True)

    rag = LightRAG(
        working_dir=working_dir,
        embedding_func=_embedding_func,
        llm_model_func=groq_llm_complete,
        graph_storage="NetworkXStorage",
        vector_storage="FaissVectorDBStorage",
        chunk_token_size=800,
        chunk_overlap_token_size=100
    )

    await rag.initialize_storages()
    initialize_share_data()
    await initialize_pipeline_status()

    return rag


async def index_data(rag: LightRAG, file_path: str) -> None:
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"Data file not found: {file_path}")

    with open(file_path, 'r', encoding='utf-8') as f:
        text = f.read()

    await rag.ainsert(input=text, file_paths=[file_path])


async def index_file(rag: LightRAG, path: str) -> None:
    await index_data(rag, path)


async def direct_llm_query(question: str) -> str:
    return await groq_llm_complete(question, system_prompt="You are a helpful assistant. Answer the question directly and concisely.")
