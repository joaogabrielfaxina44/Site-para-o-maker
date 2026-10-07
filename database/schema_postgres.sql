-- ==============================================================================
-- SISTEMA DE CAIXA DE REMÉDIOS INTELIGENTE 7x4 (ARDUINO UNO)
-- Esquema de Banco de Dados: PostgreSQL
-- ==============================================================================

-- Criar extensão para UUID se necessário
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Tabela principal para armazenamento dos lembretes de medicação
CREATE TABLE IF NOT EXISTS lembretes (
    id SERIAL PRIMARY KEY,
    grupo_id VARCHAR(36) NOT NULL, -- Identificador único para agrupar agendamentos criados juntos (múltiplos dias)
    nome_remedio VARCHAR(120) NOT NULL,
    dia_semana SMALLINT NOT NULL CHECK (dia_semana BETWEEN 0 AND 6),
    -- Eixo X: 0 = Domingo, 1 = Segunda, 2 = Terça, 3 = Quarta, 4 = Quinta, 5 = Sexta, 6 = Sábado
    
    turno SMALLINT NOT NULL CHECK (turno BETWEEN 0 AND 3),
    -- Eixo Y: 0 = Manhã, 1 = Tarde, 2 = Noite, 3 = Cama
    
    horario TIME NOT NULL, -- Horário exato do alarme (ex: 08:00:00)
    ativo BOOLEAN NOT NULL DEFAULT TRUE, -- Liga/desliga o lembrete
    observacoes TEXT, -- Instruções extras (ex: 'Tomar em jejum com água')
    criado_em TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    atualizado_em TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Índices para otimização de busca
CREATE INDEX IF NOT EXISTS idx_lembretes_dia_turno ON lembretes(dia_semana, turno);
CREATE INDEX IF NOT EXISTS idx_lembretes_horario ON lembretes(horario);
CREATE INDEX IF NOT EXISTS idx_lembretes_ativo ON lembretes(ativo);
CREATE INDEX IF NOT EXISTS idx_lembretes_grupo ON lembretes(grupo_id);

-- Comentários das colunas
COMMENT ON TABLE lembretes IS 'Armazena a programação dos alarmes para a matriz 7x4 da caixa de remédios';
COMMENT ON COLUMN lembretes.dia_semana IS '0: Domingo, 1: Segunda, 2: Terça, 3: Quarta, 4: Quinta, 5: Sexta, 6: Sábado';
COMMENT ON COLUMN lembretes.turno IS '0: Manhã, 1: Tarde, 2: Noite, 3: Cama';

-- Dados iniciais de teste (Exemplo)
INSERT INTO lembretes (grupo_id, nome_remedio, dia_semana, turno, horario, observacoes)
VALUES 
    (uuid_generate_v4()::text, 'Losartana 50mg', 1, 0, '08:00:00', 'Tomar após café da manhã'),
    (uuid_generate_v4()::text, 'Sinvastatina 20mg', 1, 2, '20:00:00', 'Tomar à noite'),
    (uuid_generate_v4()::text, 'Melatonina 3mg', 1, 3, '22:30:00', 'Antes de dormir');
