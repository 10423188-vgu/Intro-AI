# LightRAG — Hệ thống hỏi đáp tài liệu thông minh

Hệ thống RAG (Retrieval-Augmented Generation) cho phép chat với tài liệu văn bản. Sử dụng LightRAG để xây dựng knowledge graph và vector search, kết hợp Groq LLM để sinh câu trả lời.

---

## Tech Stack

| Thành phần | Công nghệ |
|---|---|
| Web API | FastAPI + uvicorn |
| RAG framework | LightRAG |
| LLM | Groq — llama-3.3-70b-versatile |
| Embedding | SentenceTransformer all-MiniLM-L6-v2 (local, không cần API) |
| Graph storage | NetworkXStorage (.graphml) |
| Vector storage | FaissVectorDBStorage (.index) |
| Frontend | HTML đơn file (`frontend/index.html`) |

> **Không dùng Docker, không dùng Neo4j.** Toàn bộ chạy local, storage lưu vào thư mục `rag_storage/`.

---

## Yêu cầu

- Python 3.10+
- Groq API Key (miễn phí tại [console.groq.com](https://console.groq.com))

---

## Cài đặt & Chạy

```bash
# 1. Cài dependencies
pip install -r requirements.txt

# 2. Tạo file .env
echo GROQ_API_KEY=gsk_your_key_here > .env

# 3. Đặt dữ liệu vào data/data.txt

# 4. Chạy server
cd src
python main.py
```

API chạy tại **http://localhost:8000**

Mở `frontend/index.html` trực tiếp trên trình duyệt để dùng giao diện chat.

---

## Cấu hình `.env`

```env
# Bắt buộc
GROQ_API_KEY=gsk_...

# Tuỳ chọn (có giá trị mặc định)
DATA_PATH=./data/data.txt
RAG_STORAGE_PATH=rag_storage
```

---

## Dữ liệu

Đặt nội dung văn bản cần index vào `data/data.txt`. Hệ thống tự động index khi khởi động lần đầu và lưu vào `rag_storage/`.

Nếu muốn index lại khi thay đổi dữ liệu:

```bash
curl -X POST http://localhost:8000/reindex
```

---

## API

### Hỏi đáp

```bash
curl -X POST http://localhost:8000/query \
     -H "Content-Type: application/json" \
     -d '{"question": "Câu hỏi của bạn", "mode": "mix", "top_k": 5}'
```

**Request:**

| Field | Type | Default | Mô tả |
|---|---|---|---|
| `question` | string | — | Câu hỏi |
| `mode` | string | `"mix"` | `naive` / `local` / `global` / `hybrid` / `mix` |
| `top_k` | int | `5` | Số kết quả tối đa (1–50) |
| `force_reindex` | bool | `false` | Bắt buộc index lại |

**Response:**

```json
{
    "question": "Câu hỏi của bạn",
    "answer": "Câu trả lời từ hệ thống",
    "mode": "mix",
    "top_k": 5,
    "status": "success"
}
```

### Các endpoint khác

| Method | Path | Mô tả |
|---|---|---|
| `GET` | `/` | Thông tin version |
| `GET` | `/health` | Trạng thái hệ thống |
| `GET` | `/docs` | Swagger UI |
| `POST` | `/reindex` | Index lại dữ liệu |

---

## Chế độ tìm kiếm

| Mode | Cách hoạt động |
|---|---|
| `naive` | Vector search thuần túy, nhanh nhất |
| `local` | Tìm kiếm context cục bộ |
| `global` | Duyệt knowledge graph toàn cục |
| `hybrid` | Kết hợp vector + graph |
| `mix` | LightRAG tự chọn mode phù hợp **(khuyến nghị)** |

---

## Cấu trúc dự án

```
chatRAG/
├── .env                   # API keys (không commit)
├── requirements.txt
├── data/
│   └── data.txt          # Tài liệu nguồn
├── frontend/
│   └── index.html        # Giao diện chat
├── rag_storage/          # Storage tự động (không commit)
└── src/
    ├── main.py           # Entry point
    ├── ingestion.py      # Groq LLM + embedding setup
    ├── controller/       # HTTP layer
    ├── service/          # Business logic
    ├── dto/              # Request/Response models
    └── util/             # Text search, validation, logging
```

---

## Troubleshooting

**Groq API key lỗi**
```
# Kiểm tra .env có đúng key chưa
# Key bắt đầu bằng gsk_
```

**Port 8000 bị chiếm**
```bash
# Windows
netstat -ano | findstr 8000
taskkill /PID <pid> /F
```

**Index lại khi đổi dữ liệu**
```bash
curl -X POST http://localhost:8000/reindex
# Hoặc xóa thư mục rag_storage/ rồi restart server
```

**Embedding model chậm lần đầu**

SentenceTransformer tải model từ HuggingFace lần đầu (~90MB), sau đó cache local. Bình thường.

---

## Tài liệu kỹ thuật

Xem [src/ARCHITECTURE.md](src/ARCHITECTURE.md) để biết chi tiết kiến trúc, data flow và storage design.
