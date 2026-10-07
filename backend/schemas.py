from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, Field, field_validator

DIAS_SEMANA_MAP = {
    0: "Domingo",
    1: "Segunda-feira",
    2: "Terça-feira",
    3: "Quarta-feira",
    4: "Quinta-feira",
    5: "Sexta-feira",
    6: "Sábado"
}

TURNOS_MAP = {
    0: "Manhã",
    1: "Tarde",
    2: "Noite",
    3: "Cama"
}

class LembreteBase(BaseModel):
    nome_remedio: str = Field(..., min_length=1, max_length=120, description="Nome do medicamento")
    turno: int = Field(..., ge=0, le=3, description="Turno: 0=Manhã, 1=Tarde, 2=Noite, 3=Cama")
    horario: str = Field(..., pattern=r"^([01]\d|2[0-3]):([0-5]\d)$", description="Horário no formato HH:MM")
    ativo: bool = Field(default=True, description="Status do alarme")
    observacoes: Optional[str] = Field(default=None, max_length=255)

class LembreteCreate(LembreteBase):
    dias_semana: List[int] = Field(..., min_length=1, description="Lista de dias selecionados (0 a 6)")

    @field_validator("dias_semana")
    @classmethod
    def validar_dias(cls, v: List[int]) -> List[int]:
        for dia in v:
            if dia < 0 or dia > 6:
                raise ValueError("Cada dia da semana deve ser um número entre 0 e 6")
        return sorted(list(set(v)))

class LembreteUpdate(BaseModel):
    nome_remedio: Optional[str] = Field(None, min_length=1, max_length=120)
    dia_semana: Optional[int] = Field(None, ge=0, le=6)
    turno: Optional[int] = Field(None, ge=0, le=3)
    horario: Optional[str] = Field(None, pattern=r"^([01]\d|2[0-3]):([0-5]\d)$")
    ativo: Optional[bool] = None
    observacoes: Optional[str] = None

class LembreteResponse(BaseModel):
    id: int
    grupo_id: str
    nome_remedio: str
    dia_semana: int
    turno: int
    horario: str
    ativo: bool
    observacoes: Optional[str] = None
    criado_em: Optional[datetime] = None
    dia_nome: Optional[str] = None
    turno_nome: Optional[str] = None

    class Config:
        from_attributes = True

class TesteDisparoRequest(BaseModel):
    dia_semana: int = Field(..., ge=0, le=6)
    turno: int = Field(..., ge=0, le=3)
