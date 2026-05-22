from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List, Dict, Optional
import uvicorn
import os
import json

app = FastAPI(title="MindMap Service")

# Модель данных для узла
class MindMapNode(BaseModel):
    id: str
    text: Dict[str, str]  # {"ru": "...", "en": "...", "kk": "..."}
    category: Dict[str, str]
    type: str # root, topic, subtopic

# Модель для связи
class MindMapLink(BaseModel):
    source: str
    target: str
    label: Dict[str, str]

# Модель всей карты
class MindMap(BaseModel):
    transcription_id: str
    nodes: List[MindMapNode]
    links: List[MindMapLink]

# Временное хранилище (с персистентным JSON-файлом)
db: Dict[str, MindMap] = {}
DB_FILE_PATH = os.getenv("DB_FILE_PATH", "/app/data/mindmaps_db.json")

def load_db():
    global db
    if os.path.exists(DB_FILE_PATH):
        try:
            with open(DB_FILE_PATH, "r", encoding="utf-8") as f:
                data = json.load(f)
                for tid, mm_dict in data.items():
                    db[tid] = MindMap(**mm_dict)
            print(f"Загружено {len(db)} карт(ы) из {DB_FILE_PATH}")
        except Exception as e:
            print(f"Ошибка загрузки базы данных: {e}")

def save_db():
    try:
        dir_name = os.path.dirname(DB_FILE_PATH)
        if dir_name and not os.path.exists(dir_name):
            os.makedirs(dir_name, exist_ok=True)
            
        data_to_save = {}
        for tid, mm in db.items():
            if hasattr(mm, "model_dump"):
                data_to_save[tid] = mm.model_dump()
            else:
                data_to_save[tid] = mm.dict()
                
        with open(DB_FILE_PATH, "w", encoding="utf-8") as f:
            json.dump(data_to_save, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print(f"Ошибка сохранения базы данных: {e}")

# Загружаем базу при старте
load_db()

@app.post("/mindmap/save")
async def save_mindmap(data: MindMap):
    db[data.transcription_id] = data
    save_db()
    return {"status": "success", "id": data.transcription_id}

@app.get("/mindmap/{transcription_id}")
async def get_mindmap(transcription_id: str):
    if transcription_id not in db:
        raise HTTPException(status_code=404, detail="MindMap not found")
    return db[transcription_id]

# Поиск со схожестью (заглушка для логики схожести)
@app.get("/mindmap/search")
async def search_mindmaps(q: str, lang: str = "ru"):
    results = []
    for tid, mm in db.items():
        # Простой поиск по тексту узлов
        matches = []
        for node in mm.nodes:
            text = node.text.get(lang, "").lower()
            if q.lower() in text:
                # Расчет схожести (упрощенно)
                similarity = 0.9 if q.lower() == text else 0.5
                matches.append({
                    "node_id": node.id,
                    "text": node.text.get(lang),
                    "similarity": similarity
                })
        
        if matches:
            results.append({
                "transcription_id": tid,
                "matches": matches
            })
    
    return sorted(results, key=lambda x: max(m['similarity'] for m in x['matches']), reverse=True)

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=3005)
