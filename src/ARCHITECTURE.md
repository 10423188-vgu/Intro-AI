# Tài liệu kiến trúc hệ thống RAG

**Hướng dẫn chi tiết về cấu trúc, thiết kế và luồng xử lý**

---

## Mục lục

1. [Tổng quan kiến trúc](#tổng-quan-kiến-trúc)
2. [Tech Stack](#tech-stack)
3. [Cấu trúc thư mục](#cấu-trúc-thư-mục)
4. [Chi tiết từng layer](#chi-tiết-từng-layer)
5. [Data Flow](#data-flow)
6. [Storage Design](#storage-design)
7. [API Design](#api-design)
8. [Cấu hình môi trường](#cấu-hình-môi-trường)

---

## Tổng quan kiến trúc

Hệ thống được tổ chức theo mô hình **MVC (Model-View-Controller)**, sử dụng LightRAG làm framework RAG cốt lõi. Toàn bộ chạy local — không cần Docker, không cần database server bên ngoài.

```
┌──────────────────────────────────────────────────────────┐
│                    RAG System Architecture               │
├──────────────────────────────────────────────────────────┤
│  Frontend Layer:   frontend/index.html (Chat UI)        │
│  API Layer:        FastAPI + uvicorn (:8000)            │
│  Business Layer:   Python services + async/await        │
│  AI Layer:         Groq (llama-3.3-70b-versatile)       │
│  Embedding Layer:  SentenceTransformer (all-MiniLM-L6)  │
│  Graph Storage:    NetworkXStorage (.graphml file)       │
│  Vector Storage:   FaissVectorDBStorage (.index files)  │
│  KV Storage:       JSON files (rag_storage/)            │
└──────────────────────────────────────────────────────────┘
```

---

## Tech Stack

| Thành phần | Công nghệ | Ghi chú |
|---|---|---|
| Web framework | FastAPI | Async, tự tạo OpenAPI docs |
| Web server | uvicorn | ASGI server |
| RAG framework | LightRAG | Xử lý graph + vector RAG |
| LLM | Groq — llama-3.3-70b-versatile | Gọi qua OpenAI-compatible API |
| Embedding | SentenceTransformer all-MiniLM-L6-v2 | Local, 384 chiều, không cần API key |
| Graph storage | NetworkXStorage | Lưu file `.graphml` trong rag_storage/ |
| Vector storage | FaissVectorDBStorage | Lưu file `.index` trong rag_storage/ |
| KV storage | JSON files | Lưu entities, chunks, docs, cache |
| Data validation | Pydantic | DTOs và model validation |
| Frontend | HTML đơn file | Chat UI tĩnh, gọi API qua fetch |

---

## Cấu trúc thư mục

```
chatRAG/
├── .env                        # API keys và config (không commit)
├── requirements.txt            # Python dependencies
├── data/
│   └── data.txt               # File dữ liệu nguồn để index
├── frontend/
│   └── index.html             # Giao diện chat (chạy mở trực tiếp trên browser)
├── rag_storage/               # Lưu trữ tự động của LightRAG (auto-generated)
│   ├── kv_store_full_docs.json
│   ├── kv_store_text_chunks.json
│   ├── kv_store_full_entities.json
│   ├── kv_store_full_relations.json
│   ├── kv_store_entity_chunks.json
│   ├── kv_store_relation_chunks.json
│   ├── kv_store_llm_response_cache.json
│   ├── kv_store_doc_status.json
│   ├── graph_chunk_entity_relation.graphml
│   ├── faiss_index_entities.index
│   ├── faiss_index_relationships.index
│   └── faiss_index_chunks.index
└── src/
    ├── main.py                # Entry point — FastAPI app + routes
    ├── ingestion.py           # RAG init, Groq LLM, embedding setup
    ├── ARCHITECTURE.md
    ├── controller/
    │   ├── __init__.py
    │   └── rag_controller.py  # HTTP request/response handling
    ├── service/
    │   ├── __init__.py
    │   └── rag_service.py     # Business logic, RAG operations
    ├── dto/
    │   ├── __init__.py
    │   ├── QueryRequest.py
    │   ├── QueryResponse.py
    │   └── ErrorResponse.py
    └── util/
        ├── __init__.py
        └── text_search_util.py   # TextSearchUtil, ValidationUtil, LogUtil
```

---

## Chi tiết từng layer

### 1. Controller Layer — `controller/rag_controller.py`

Xử lý HTTP request/response, validation đầu vào, và chuyển tiếp sang service.

```python
class RAGController:
    def __init__(self, data_path: str = None)      # Đọc DATA_PATH từ .env
    async def initialize_system()                   # Gọi khi app startup
    async def process_query(request: QueryRequest)  # Xử lý câu hỏi
    async def get_health_status()                   # Health check
    async def reindex_data()                        # Trigger reindex thủ công
    def get_basic_info()                            # Thông tin version
```

**Patterns sử dụng:**
- Dependency Injection: `RAGService` được inject vào controller
- Error Boundary: bắt exception và convert thành HTTPException
- Input Validation: gọi `ValidationUtil` trước khi xử lý

### 2. Service Layer — `service/rag_service.py`

Chứa toàn bộ business logic. Quản lý vòng đời RAG, retry khi indexing thất bại, và fallback về local text search.

```python
class RAGService:
    self.rag: Optional[LightRAG]       # RAG instance
    self.raw_text: Optional[str]       # Văn bản thô (dùng khi fallback)
    self.indexing_complete: bool       # Trạng thái index

    async def initialize(force_reindex: bool = False)
    async def get_answer(question, mode, top_k, force_reindex) -> str
    def get_status() -> dict
```

**Luồng xử lý câu hỏi:**
1. Gọi `initialize()` (skip nếu đã init)
2. Nếu RAG sẵn sàng → gọi `rag.aquery()`
3. Nếu RAG trả về "no context" → gọi `direct_llm_query()` (Groq trực tiếp)
4. Nếu RAG lỗi → fallback về `TextSearchUtil.local_search()`

**Retry logic khi indexing:**
- Thử `index_file()` tối đa 3 lần
- Nếu vẫn thất bại → thử `rag.ainsert()` trực tiếp với raw text
- Nếu cả hai đều thất bại → lưu `raw_text` để dùng fallback

### 3. Ingestion — `ingestion.py`

Khởi tạo LightRAG với Groq LLM và SentenceTransformer embedding.

```python
# LLM: Groq qua OpenAI-compatible endpoint
async def groq_llm_complete(prompt, system_prompt, history_messages, **kwargs)
    # Model: llama-3.3-70b-versatile
    # Base URL: https://api.groq.com/openai/v1

# Embedding: local, không cần API
async def local_embed(texts) -> np.ndarray
    # Model: all-MiniLM-L6-v2 (384 dim, max 512 tokens)

# Khởi tạo LightRAG instance
async def initialize_rag(working_dir: str = None) -> LightRAG
    # graph_storage = NetworkXStorage
    # vector_storage = FaissVectorDBStorage
    # chunk_token_size = 800
    # chunk_overlap_token_size = 100

# Indexing
async def index_file(rag: LightRAG, path: str) -> None

# Direct LLM (bypass RAG khi không có context)
async def direct_llm_query(question: str) -> str
```

### 4. DTO Layer — `dto/`

```python
class QueryRequest(BaseModel):
    question: str
    mode: Optional[str] = "mix"         # naive|local|global|hybrid|mix
    top_k: Optional[int] = 5            # 1–50
    force_reindex: Optional[bool] = False

class QueryResponse(BaseModel):
    question: str
    answer: str
    mode: str
    top_k: int
    status: str                         # "success" | "error"
```

### 5. Util Layer — `util/text_search_util.py`

**`TextSearchUtil`** — fallback search khi RAG không khả dụng:
- Chia text thành đoạn văn theo dòng trống
- Tokenize và đếm overlap từ với câu hỏi
- Trả về `top_k` đoạn có điểm cao nhất

**`ValidationUtil`** — validate input:
- `validate_file_path(path)` — kiểm tra tồn tại, không rỗng
- `validate_query_params(question, mode, top_k)` — kiểm tra mode hợp lệ, top_k trong khoảng 1–50

**`LogUtil`** — structured logging ra stdout:
- `log_info(message, component)`
- `log_error(message, component, exception)`
- `log_warning(message, component)`

---

## Data Flow

### Startup

```
FastAPI startup event
  └── RAGController.initialize_system()
        └── RAGService.initialize()
              ├── Kiểm tra data file tồn tại và không rỗng
              ├── initialize_rag() → tạo LightRAG instance
              │     ├── Groq LLM setup (cần GROQ_API_KEY)
              │     ├── SentenceTransformer embedding (local)
              │     ├── NetworkXStorage (graph)
              │     └── FaissVectorDBStorage (vector)
              └── index_file() → đọc data.txt và insert vào RAG
                    ├── Retry tối đa 3 lần nếu thất bại
                    └── Fallback: lưu raw_text nếu vẫn lỗi
```

### Query Processing

```
POST /query
  └── RAGController.process_query()
        ├── ValidationUtil.validate_query_params()
        └── RAGService.get_answer()
              ├── [RAG sẵn sàng] rag.aquery(question, QueryParam)
              │     ├── Kết quả OK → trả về
              │     └── "no context" → direct_llm_query() (Groq)
              └── [RAG lỗi] TextSearchUtil.local_search(raw_text, question)
```

### Reindex

```
POST /reindex
  └── RAGService.initialize(force_reindex=True)
        └── Xóa RAG cũ, khởi tạo lại từ đầu
```

---

## Storage Design

LightRAG tự quản lý toàn bộ storage trong thư mục `rag_storage/`. Không cần database server.

### KV Stores (JSON files)

| File | Nội dung |
|---|---|
| `kv_store_full_docs.json` | Toàn bộ document gốc |
| `kv_store_text_chunks.json` | Các chunk text sau khi split |
| `kv_store_full_entities.json` | Entities được extract từ text |
| `kv_store_full_relations.json` | Relations giữa các entities |
| `kv_store_entity_chunks.json` | Mapping entity → chunk |
| `kv_store_relation_chunks.json` | Mapping relation → chunk |
| `kv_store_llm_response_cache.json` | Cache kết quả LLM |
| `kv_store_doc_status.json` | Trạng thái indexing từng doc |

### Graph Storage

`graph_chunk_entity_relation.graphml` — đồ thị quan hệ giữa entities, được quản lý bởi NetworkX, lưu ra file `.graphml`.

### Vector Storage (Faiss)

| File | Nội dung |
|---|---|
| `faiss_index_entities.index` | Embedding của entities (384 dim) |
| `faiss_index_relationships.index` | Embedding của relationships |
| `faiss_index_chunks.index` | Embedding của text chunks |

Mỗi index kèm file `.meta.json` chứa metadata tương ứng.

---

## API Design

### Endpoints

| Method | Path | Mô tả |
|---|---|---|
| `GET` | `/` | Thông tin version |
| `GET` | `/health` | Trạng thái hệ thống |
| `POST` | `/query` | Hỏi đáp RAG |
| `POST` | `/reindex` | Reindex thủ công |

### Query Modes

| Mode | Cách hoạt động |
|---|---|
| `naive` | Vector search thuần túy |
| `local` | Tìm kiếm context cục bộ |
| `global` | Duyệt knowledge graph toàn cục |
| `hybrid` | Kết hợp vector + graph |
| `mix` | LightRAG tự chọn mode phù hợp (mặc định) |

### Request / Response

```json
// POST /query
{
    "question": "Câu hỏi của người dùng",
    "mode": "mix",
    "top_k": 5,
    "force_reindex": false
}

// Response 200
{
    "question": "Câu hỏi của người dùng",
    "answer": "Câu trả lời từ hệ thống",
    "mode": "mix",
    "top_k": 5,
    "status": "success"
}

// GET /health
{
    "status": "healthy",
    "rag_initialized": true,
    "indexing_complete": true,
    "data_path": "/path/to/data.txt",
    "has_fallback_text": false
}
```

---

## Cấu hình môi trường

File `.env` tại root project:

```bash
# Bắt buộc
GROQ_API_KEY=gsk_...               # API key của Groq

# Tuỳ chọn (có giá trị mặc định)
DATA_PATH=./data/data.txt          # Đường dẫn file dữ liệu
RAG_STORAGE_PATH=rag_storage       # Thư mục lưu RAG indexes
```

Embedding model (`all-MiniLM-L6-v2`) được tải tự động từ HuggingFace lần đầu chạy, sau đó cache local. Không cần API key.

### Chạy hệ thống

```bash
pip install -r requirements.txt
# Tạo .env với GROQ_API_KEY
cd src
python main.py          # Server chạy tại http://localhost:8000
# Mở frontend/index.html trực tiếp trên browser để chat
```
