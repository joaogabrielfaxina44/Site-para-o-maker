import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

# Lê a URL de conexão do ambiente ou usa SQLite como padrão para execução imediata sem configuração externa
# Exemplos para PostgreSQL ou MySQL:
# PostgreSQL: DATABASE_URL="postgresql+psycopg2://usuario:senha@localhost:5432/caixa_remedios"
# MySQL:      DATABASE_URL="mysql+pymysql://usuario:senha@localhost:3306/caixa_remedios"
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./caixa_remedios.db")

connect_args = {}
if DATABASE_URL.startswith("sqlite"):
    connect_args = {"check_same_thread": False}

engine = create_engine(
    DATABASE_URL,
    connect_args=connect_args,
    pool_pre_ping=True
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    """Dependência para obter uma sessão de banco de dados em endpoints FastAPI."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
