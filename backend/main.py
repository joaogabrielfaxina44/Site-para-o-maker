import os
import uuid
from typing import List
from contextlib import asynccontextmanager
from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session
import uvicorn

from .database import engine, Base, SessionLocal, get_db
from .models import Lembrete
from .schemas import (
    LembreteCreate,
    LembreteUpdate,
    LembreteResponse,
    TesteDisparoRequest,
    DIAS_SEMANA_MAP,
    TURNOS_MAP
)

# Cria as tabelas automaticamente se não existirem
Base.metadata.create_all(bind=engine)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Popula dados de exemplo caso o banco de dados esteja zerado
    db = SessionLocal()
    try:
        if db.query(Lembrete).count() == 0:
            exemplo_grupo = str(uuid.uuid4())
            exemplos = [
                Lembrete(grupo_id=exemplo_grupo, nome_remedio="Losartana 50mg", dia_semana=1, turno=0, horario="08:00", observacoes="Tomar após o café"),
                Lembrete(grupo_id=exemplo_grupo, nome_remedio="Losartana 50mg", dia_semana=2, turno=0, horario="08:00", observacoes="Tomar após o café"),
                Lembrete(grupo_id=exemplo_grupo, nome_remedio="Losartana 50mg", dia_semana=3, turno=0, horario="08:00", observacoes="Tomar após o café"),
                Lembrete(grupo_id=str(uuid.uuid4()), nome_remedio="Metformina 850mg", dia_semana=1, turno=1, horario="12:30", observacoes="Com o almoço"),
                Lembrete(grupo_id=str(uuid.uuid4()), nome_remedio="Sinvastatina 20mg", dia_semana=1, turno=2, horario="20:00", observacoes="À noite"),
                Lembrete(grupo_id=str(uuid.uuid4()), nome_remedio="Melatonina 3mg", dia_semana=1, turno=3, horario="22:30", observacoes="Ao deitar"),
            ]
            db.add_all(exemplos)
            db.commit()
    finally:
        db.close()
    yield

app = FastAPI(
    title="Caixa de Remédios Inteligente - API",
    description="Backend para gerenciamento de alarmes e controle da matriz física 7x4 do Arduino.",
    version="1.0.0",
    lifespan=lifespan
)

# Habilita CORS para permitir acesso local e de outros dispositivos na rede
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def format_lembrete_response(lembrete: Lembrete) -> LembreteResponse:
    """Adiciona rótulos legíveis de dia e turno ao objeto retornado."""
    data = LembreteResponse.model_validate(lembrete)
    data.dia_nome = DIAS_SEMANA_MAP.get(lembrete.dia_semana, f"Dia {lembrete.dia_semana}")
    data.turno_nome = TURNOS_MAP.get(lembrete.turno, f"Turno {lembrete.turno}")
    return data

@app.get("/api/lembretes", response_model=List[LembreteResponse], summary="Listar todos os lembretes")
def listar_lembretes(db: Session = Depends(get_db)):
    """Retorna todos os agendamentos cadastrados ordenados por dia da semana e horário."""
    lembretes = db.query(Lembrete).order_by(Lembrete.dia_semana, Lembrete.horario, Lembrete.turno).all()
    return [format_lembrete_response(l) for l in lembretes]

@app.post("/api/lembretes", response_model=List[LembreteResponse], status_code=status.HTTP_201_CREATED, summary="Criar novo(s) lembrete(s)")
def criar_lembrete(dados: LembreteCreate, db: Session = Depends(get_db)):
    """
    Cadastra um remédio. Se múltiplos dias forem selecionados, 
    cria um registro para cada dia com o mesmo 'grupo_id'.
    """
    grupo_id = str(uuid.uuid4())
    criados = []

    for dia in dados.dias_semana:
        # Verifica se já existe um remédio configurado no mesmo dia e turno
        existente = db.query(Lembrete).filter(
            Lembrete.dia_semana == dia,
            Lembrete.turno == dados.turno,
            Lembrete.ativo == True
        ).first()

        novo_lembrete = Lembrete(
            grupo_id=grupo_id,
            nome_remedio=dados.nome_remedio.strip(),
            dia_semana=dia,
            turno=dados.turno,
            horario=dados.horario,
            ativo=dados.ativo,
            observacoes=dados.observacoes.strip() if dados.observacoes else None
        )
        db.add(novo_lembrete)
        criados.append(novo_lembrete)

    db.commit()
    for item in criados:
        db.refresh(item)

    return [format_lembrete_response(item) for item in criados]

@app.get("/api/lembretes/{lembrete_id}", response_model=LembreteResponse, summary="Obter detalhes de um lembrete")
def obter_lembrete(lembrete_id: int, db: Session = Depends(get_db)):
    lembrete = db.query(Lembrete).filter(Lembrete.id == lembrete_id).first()
    if not lembrete:
        raise HTTPException(status_code=404, detail="Lembrete não encontrado")
    return format_lembrete_response(lembrete)

@app.put("/api/lembretes/{lembrete_id}", response_model=LembreteResponse, summary="Atualizar um lembrete")
def atualizar_lembrete(lembrete_id: int, dados: LembreteUpdate, db: Session = Depends(get_db)):
    lembrete = db.query(Lembrete).filter(Lembrete.id == lembrete_id).first()
    if not lembrete:
        raise HTTPException(status_code=404, detail="Lembrete não encontrado")

    update_dict = dados.model_dump(exclude_unset=True)
    for campo, valor in update_dict.items():
        if campo == "nome_remedio" and valor is not None:
            valor = valor.strip()
        setattr(lembrete, campo, valor)

    db.commit()
    db.refresh(lembrete)
    return format_lembrete_response(lembrete)

@app.delete("/api/lembretes/{lembrete_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Excluir um lembrete")
def excluir_lembrete(lembrete_id: int, db: Session = Depends(get_db)):
    lembrete = db.query(Lembrete).filter(Lembrete.id == lembrete_id).first()
    if not lembrete:
        raise HTTPException(status_code=404, detail="Lembrete não encontrado")
    db.delete(lembrete)
    db.commit()
    return None

@app.delete("/api/grupos/{grupo_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Excluir todos os lembretes de um grupo")
def excluir_grupo(grupo_id: str, db: Session = Depends(get_db)):
    registros = db.query(Lembrete).filter(Lembrete.grupo_id == grupo_id).all()
    if not registros:
        raise HTTPException(status_code=404, detail="Grupo não encontrado")
    for r in registros:
        db.delete(r)
    db.commit()
    return None

@app.get("/api/alarmes/ativos", summary="Consultar lista de alarmes para a ponte serial")
def alarmes_ativos(db: Session = Depends(get_db)):
    """
    Retorna apenas os alarmes ativos em um formato enxuto,
    ideal para o script Python de comunicação serial com o Arduino.
    """
    lembretes = db.query(Lembrete).filter(Lembrete.ativo == True).order_by(Lembrete.dia_semana, Lembrete.horario).all()
    resultado = []
    for l in lembretes:
        hora, minuto = map(int, l.horario.split(":"))
        resultado.append({
            "id": l.id,
            "remedio": l.nome_remedio,
            "dia": l.dia_semana,
            "turno": l.turno,
            "hora": hora,
            "minuto": minuto,
            "horario_formatado": l.horario
        })
    return {"alarmes": resultado, "total": len(resultado)}

@app.post("/api/hardware/teste", summary="Disparo de teste manual para o Arduino")
def testar_compartimento(req: TesteDisparoRequest):
    """
    Endpoint de teste para acionar imediatamente um compartimento (Dia, Turno).
    A ponte serial pode escutar ou este endpoint pode logar para depuração.
    """
    return {
        "status": "comando_registrado",
        "dia": req.dia_semana,
        "turno": req.turno,
        "mensagem": f"Compartimento Dia {DIAS_SEMANA_MAP.get(req.dia_semana)} x Turno {TURNOS_MAP.get(req.turno)} pronto para disparo."
    }

# Servir os arquivos estáticos do Frontend
caminho_frontend = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "frontend"))
if os.path.exists(caminho_frontend):
    app.mount("/", StaticFiles(directory=caminho_frontend, html=True), name="frontend")

if __name__ == "__main__":
    print("[*] Iniciando servidor em http://localhost:8000 ...")
    uvicorn.run("backend.main:app", host="0.0.0.0", port=8000, reload=True)
