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

# Временное хранилище (в идеале - БД)
db: Dict[str, MindMap] = {}

@app.post("/mindmap/save")
async def save_mindmap(data: MindMap):
    db[data.transcription_id] = data
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
