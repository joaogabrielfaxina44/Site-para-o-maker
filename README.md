# 💊 Caixa de Remédios Inteligente 7x4 (Arduino Uno + Full-Stack / GitHub Pages)

Sistema completo de controle e agendamento de alarmes para uma **Caixa de Remédios Inteligente** com matriz física de compartimentos **7x4** (7 dias da semana no Eixo X por 4 turnos no Eixo Y: Manhã, Tarde, Noite e Cama).

O sistema suporta **dois modos de operação**:
1. **🌐 Modo GitHub Pages 100% Serverless (Web Serial API):** O site roda diretamente no GitHub Pages e se conecta ao Arduino Uno via cabo USB diretamente pelo navegador (Google Chrome, Edge, Opera) utilizando a **Web Serial API**, gravando os dados no `localStorage`.
2. **🖥️ Modo Full-Stack Local (FastAPI + SQL + Python Bridge):** API REST local com persistência em PostgreSQL / MySQL / SQLite e script Python autônomo com `pyserial`.

---

## 🚀 Como Ativar no GitHub Pages

1. Faça o commit e envie os arquivos para o seu repositório no GitHub (`main` ou `master`).
2. No GitHub, acesse: **Settings** (Configurações do Repositório) > **Pages**.
3. Em **Build and deployment > Source**, selecione:
   - **Branch:** `main` (ou a branch principal).
   - **Folder:** `/ (root)` e clique em **Save**.
4. Em 1 a 2 minutos, o GitHub disponibilizará o link público HTTPS: `https://<seu-usuario>.github.io/<seu-repositorio>/`.
5. Abra o link no **Google Chrome** ou **Microsoft Edge**, conecte o Arduino Uno via cabo USB e clique no botão **"Conectar Arduino (USB)"** no topo da tela! Pronto!

---

## 📐 Arquitetura Geral do Sistema

```
┌────────────────────────────────────────────────────────┐
│     NAVEGADOR WEB (Idoso / Cuidador)                   │
│     • HTML5 / CSS3 / JavaScript Vanilla (Sem build)    │
│     • Alto Contraste, Fontes Grandes, Matriz 7x4       │
└───────────────────────────┬────────────────────────────┘
                            │ HTTP / JSON REST
                            ▼
┌────────────────────────────────────────────────────────┐
│     BACKEND WEB (FastAPI + SQLAlchemy)                 │
│     • CRUD de Lembretes & Múltiplos Dias               │
│     • Endpoint de Alarmes Ativos                       │
│     • Documentação Swagger Interativa (/docs)          │
└─────────────┬───────────────────────────┬──────────────┘
              │                           │
              ▼                           ▼
┌──────────────────────────┐  ┌──────────────────────────┐
│  BANCO DE DADOS          │  │  PONTE SERIAL (Python)   │
│  • PostgreSQL / MySQL    │  │  • Polling de Alarmes    │
│  • Fallback SQLite       │  │  • Sincronização RTC     │
│  • Tabela 'lembretes'    │  │  • PySerial via USB      │
└──────────────────────────┘  └───────────┬──────────────┘
                                          │ Cabo USB (Serial 9600 baud)
                                          ▼
                              ┌──────────────────────────┐
                              │  ARDUINO UNO             │
                              │  • Matriz 7x4 (11 Pinos) │
                              │  • Buzzer (Pino 12)      │
                              │  • Botão Dose (Pino A1)  │
                              └──────────────────────────┘
```

---

## 📁 Estrutura do Projeto

```
Site para o maker/
├── backend/
│   ├── main.py                  # API FastAPI e servidor web
│   ├── database.py              # Conexão SQLAlchemy (PostgreSQL/MySQL/SQLite)
│   ├── models.py                # Modelo ORM da tabela 'lembretes'
│   ├── schemas.py               # Schemas de validação Pydantic
│   └── requirements.txt         # Dependências Python
├── frontend/
│   ├── index.html               # Interface limpa, alto contraste e acessível
│   ├── style.css                # Estilização com fontes grandes e cores distintas
│   └── app.js                   # Lógica da interface, CRUD e Matriz 7x4
├── database/
│   ├── schema_postgres.sql      # DDL para PostgreSQL
│   └── schema_mysql.sql         # DDL para MySQL
├── hardware/
│   ├── serial_bridge.py         # Script Python de comunicação USB (PC <-> Arduino)
│   └── arduino_pillbox/
│       └── arduino_pillbox.ino  # Firmware C++ completo para o Arduino Uno
└── README.md                    # Documentação do projeto
```

---

## 🔌 Esquema Elétrico e Pinagem do Arduino Uno

A matriz 7x4 possui 28 compartimentos. O Arduino Uno controla os 11 pinos da matriz por acionamento direto ou multiplexação, mais o Buzzer e o Botão:

| Componente | Eixo / Função | Pinos do Arduino Uno |
| :--- | :--- | :--- |
| **Colunas (Dias X0 - X6)** | Domingo a Sábado | **Pinos Digitais 2, 3, 4, 5, 6, 7, 8** |
| **Linhas (Turnos Y0 - Y3)** | Manhã, Tarde, Noite, Cama | **Pinos Digitais 9, 10, 11 e A0** |
| **Buzzer** | Alarme sonoro | **Pino Digital 12** |
| **Botão de Confirmação** | "Dose Tomada" (INPUT_PULLUP) | **Pino Analógico A1** |
| **Comunicação PC** | Porta USB Serial (9600 baud) | **Pinos 0 (RX) e 1 (TX)** |

> **Nota:** Use resistores de 220Ω a 330Ω em série com os LEDs da matriz para proteção de corrente do microcontrolador. O botão no pino A1 utiliza o resistor interno de pull-up do Arduino (`INPUT_PULLUP`), bastando ligar uma ponta ao pino A1 e a outra ao GND.

---

## 🚀 Como Inicializar o Sistema Passo a Passo

### 1. Pré-requisitos
- **Python 3.10+** instalado.
- **Arduino IDE** instalada para carregar o código no Arduino Uno.
- *(Opcional)* Servidor **PostgreSQL** ou **MySQL** caso não queira usar o SQLite integrado.

---

### 2. Instalação das Dependências do Backend

No terminal, na pasta raiz do projeto:

```bash
pip install -r backend/requirements.txt
```

---

### 3. Configuração do Banco de Dados

#### Opção A: SQLite (Pronto para uso imediato, sem configuração)
O sistema vem pré-configurado para criar automaticamente o arquivo `caixa_remedios.db` localmente com dados de teste. Nenhuma etapa extra é necessária!

#### Opção B: PostgreSQL
1. Crie o banco de dados no PostgreSQL e execute o script DDL:
   ```bash
   psql -U seu_usuario -d seu_banco -f database/schema_postgres.sql
   ```
2. Defina a variável de ambiente antes de rodar o backend:
   ```bash
   # Windows PowerShell:
   $env:DATABASE_URL="postgresql+psycopg2://usuario:senha@localhost:5432/caixa_remedios"
   ```

#### Opção C: MySQL
1. Importe o script DDL no MySQL:
   ```bash
   mysql -u seu_usuario -p < database/schema_mysql.sql
   ```
2. Defina a variável de ambiente:
   ```bash
   # Windows PowerShell:
   $env:DATABASE_URL="mysql+pymysql://usuario:senha@localhost:3306/caixa_remedios"
   ```

---

### 4. Inicializar o Servidor Web e Backend

Execute o comando:

```bash
python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
```

- Acesse a interface web no navegador: **[http://localhost:8000](http://localhost:8000)**
- Documentação interativa da API (Swagger): **[http://localhost:8000/docs](http://localhost:8000/docs)**

---

### 5. Gravar o Firmware no Arduino Uno

1. Conecte o **Arduino Uno** ao computador via cabo USB.
2. Abra a **Arduino IDE**.
3. Abra o arquivo `hardware/arduino_pillbox/arduino_pillbox.ino`.
4. Selecione a placa: **Ferramentas > Placa > Arduino Uno**.
5. Selecione a porta COM correspondente: **Ferramentas > Porta > COMx**.
6. Clique em **Carregar (Upload)** (ícone de seta).
7. Quando o upload terminar, o buzzer emitirá dois bipes curtos de inicialização.

---

### 6. Executar o Script de Ponte Serial (Python)

Com o servidor web rodando e o Arduino conectado via USB, abra um segundo terminal e execute:

```bash
python hardware/serial_bridge.py
```

O script:
- Autodetecta a porta USB do Arduino Uno (ou você pode passar `--port COM3`).
- Sincroniza o relógio em tempo real com o Arduino (`TIME:...`).
- Envia os alarmes configurados no banco de dados (`SYNC:...`).
- Monitora os minutos e dispara o compartimento correspondente (`TRIGGER:...`).
- Registra no console quando o paciente pressionar o botão físico para silenciar o alarme.

#### Teste Rápido de Hardware via Linha de Comando:
Para testar se um compartimento específico acende e apita sem esperar o horário:
```bash
# Testar Segunda-feira (1), Turno Manhã (0):
python hardware/serial_bridge.py --test 1 0
```
*(Você também pode clicar no botão **"Testar"** diretamente na tabela ou na matriz visual da interface web!)*

---

## 📡 Protocolo Serial (PC ⇄ Arduino)

A comunicação é feita em texto plano ASCII terminada com caractere de quebra de linha `\n`:

| Comando | Formato | Descrição |
| :--- | :--- | :--- |
| **Sincronizar Relógio** | `TIME:<dia>,<hora>,<minuto>,<segundo>` | Ajusta o relógio interno do microcontrolador (0=Dom a 6=Sáb). |
| **Salvar Alarme** | `SYNC:<dia>,<turno>,<hora>,<minuto>` | Armazena na memória do Arduino o horário de um compartimento. |
| **Disparar Alarme** | `TRIGGER:<dia>,<turno>` | Acende imediatamente o LED e ativa o buzzer intermitente. |
| **Parar Alarme** | `STOP` | Apaga os LEDs e desliga o buzzer. |
| **Limpar Alarmes** | `CLEAR` | Zera a tabela interna de alarmes do Arduino. |
| **Resposta do Botão** | `BOTAO_PRESSIONADO: Remedio tomado!` | Enviado pelo Arduino para o PC quando o paciente aperta o botão físico. |

---

## ♿ Destaques de Acessibilidade para Idosos

1. **Botões Grandes e Fáceis de Clicar:** Áreas de toque confortáveis (mínimo de 48px de altura) com estados de foco destacados.
2. **Alto Contraste WCAG AAA:** Paleta com preto carvão sobre fundo claro e modo **Super Alto Contraste** acionável no cabeçalho.
3. **Cores Distintas por Turno:** Manhã (Laranja 🌅), Tarde (Âmbar ☀️), Noite (Azul 🌙) e Cama (Roxo 🛏️).
4. **Matriz 7x4 Visual:** Permite ao cuidador conferir de relance se cada compartimento físico da caixa tem o remédio correto agendado.
5. **Seleção Rápida de Dias:** Botões "Todos os Dias", "Segunda a Sexta" e "Fim de Semana" para facilitar preenchimento por idosos com mobilidade reduzida.
