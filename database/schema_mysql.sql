-- ==============================================================================
-- SISTEMA DE CAIXA DE REMÉDIOS INTELIGENTE 7x4 (ARDUINO UNO)
-- Esquema de Banco de Dados: MySQL (8.0+)
-- ==============================================================================

CREATE DATABASE IF NOT EXISTS caixa_remedios CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE caixa_remedios;

-- Tabela principal para armazenamento dos lembretes de medicação
CREATE TABLE IF NOT EXISTS lembretes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    grupo_id VARCHAR(36) NOT NULL COMMENT 'Identificador único para agrupar agendamentos de múltiplos dias',
    nome_remedio VARCHAR(120) NOT NULL,
    dia_semana TINYINT NOT NULL COMMENT '0=Dom, 1=Seg, 2=Ter, 3=Qua, 4=Qui, 5=Sex, 6=Sáb',
    turno TINYINT NOT NULL COMMENT '0=Manhã, 1=Tarde, 2=Noite, 3=Cama',
    horario TIME NOT NULL COMMENT 'Horário exato de disparo (HH:MM:SS)',
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    observacoes TEXT NULL,
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT chk_dia_semana CHECK (dia_semana BETWEEN 0 AND 6),
    CONSTRAINT chk_turno CHECK (turno BETWEEN 0 AND 3),
    INDEX idx_dia_turno (dia_semana, turno),
    INDEX idx_horario (horario),
    INDEX idx_ativo (ativo),
    INDEX idx_grupo (grupo_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Dados iniciais de teste (Exemplo)
INSERT INTO lembretes (grupo_id, nome_remedio, dia_semana, turno, horario, observacoes)
VALUES 
    (UUID(), 'Losartana 50mg', 1, 0, '08:00:00', 'Tomar após café da manhã'),
    (UUID(), 'Sinvastatina 20mg', 1, 2, '20:00:00', 'Tomar à noite'),
    (UUID(), 'Melatonina 3mg', 1, 3, '22:30:00', 'Antes de dormir');
