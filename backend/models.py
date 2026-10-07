from datetime import datetime
from sqlalchemy import Column, Integer, String, Boolean, DateTime
from .database import Base

class Lembrete(Base):
    __tablename__ = "lembretes"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    grupo_id = Column(String(36), index=True, nullable=False)
    nome_remedio = Column(String(120), nullable=False)
    dia_semana = Column(Integer, nullable=False, index=True)  # 0=Dom, 1=Seg, 2=Ter, 3=Qua, 4=Qui, 5=Sex, 6=Sáb
    turno = Column(Integer, nullable=False, index=True)       # 0=Manhã, 1=Tarde, 2=Noite, 3=Cama
    horario = Column(String(8), nullable=False, index=True)   # Formato 'HH:MM'
    ativo = Column(Boolean, default=True, nullable=False)
    observacoes = Column(String(255), nullable=True)
    criado_em = Column(DateTime, default=datetime.utcnow)

    def __repr__(self):
        return f"<Lembrete id={self.id} remedio='{self.nome_remedio}' dia={self.dia_semana} turno={self.turno} horario='{self.horario}'>"
