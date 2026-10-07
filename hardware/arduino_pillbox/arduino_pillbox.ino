/*
 * ==============================================================================
 * SISTEMA EMBARCADO: CAIXA DE REMÉDIOS INTELIGENTE 7x4
 * Microcontrolador: Arduino Uno
 * ==============================================================================
 * 
 * ESQUEMA DE PINAGEM E LIGAÇÃO (7 Colunas de Dias + 4 Linhas de Turnos):
 * - Colunas (Eixo X - Dias da Semana):
 *     Pino 2: Domingo (0)
 *     Pino 3: Segunda (1)
 *     Pino 4: Terça   (2)
 *     Pino 5: Quarta  (3)
 *     Pino 6: Quinta  (4)
 *     Pino 7: Sexta   (5)
 *     Pino 8: Sábado  (6)
 * 
 * - Linhas (Eixo Y - Turnos):
 *     Pino 9:  Manhã  (0)
 *     Pino 10: Tarde  (1)
 *     Pino 11: Noite  (2)
 *     Pino A0: Cama   (3)
 * 
 * - Alertas e Interação:
 *     Pino 12: Buzzer (Alerta sonoro)
 *     Pino A1: Botão físico ("Remédio Tomado / Desligar Alarme") com INPUT_PULLUP
 * 
 * COMANDOS SERIAL ACEITOS:
 *   1. TIME:<dia>,<hora>,<minuto>,<segundo>   -> Sincroniza o relógio interno
 *      Exemplo: TIME:1,08,30,00 (Segunda-feira, 08:30:00)
 * 
 *   2. SYNC:<dia>,<turno>,<hora>,<minuto>     -> Salva alarme na matriz 7x4
 *      Exemplo: SYNC:1,0,08,00 (Segunda, Manhã, às 08:00)
 * 
 *   3. TRIGGER:<dia>,<turno>                  -> Dispara alarme imediato (LED + Buzzer)
 *      Exemplo: TRIGGER:1,0 (Ativa o compartimento Segunda, Manhã)
 * 
 *   4. STOP                                   -> Cancela alarme ativo
 * ==============================================================================
 */

// Definição dos Pinos de Hardware
const uint8_t PINOS_COLUNAS_DIAS[7] = {2, 3, 4, 5, 6, 7, 8}; // Eixo X: Dom(0) a Sáb(6)
const uint8_t PINOS_LINHAS_TURNOS[4] = {9, 10, 11, A0};      // Eixo Y: Manhã(0), Tarde(1), Noite(2), Cama(3)

const uint8_t PINO_BUZZER = 12;
const uint8_t PINO_BOTAO  = A1; // Botão físico para o idoso confirmar a dose tomada

// Estrutura de dados para armazenar cada alarme na memória do Arduino
struct Alarme {
  uint8_t dia;     // 0 a 6
  uint8_t turno;   // 0 a 3
  uint8_t hora;    // 0 a 23
  uint8_t minuto;  // 0 a 59
  bool ativo;      // true se configurado
};

// Capacidade para até 28 alarmes (1 para cada compartimento da matriz 7x4)
const uint8_t MAX_ALARMES = 28;
Alarme tabelaAlarmes[MAX_ALARMES];
uint8_t totalAlarmes = 0;

// Variáveis do Relógio Interno
uint8_t relogioDia     = 0;
uint8_t relogioHora    = 0;
uint8_t relogioMinuto  = 0;
uint8_t relogioSegundo = 0;
unsigned long ultimoMillisRelogio = 0;

// Estado do Alarme Ativo (quando está tocando)
bool alarmeEmExecucao = false;
int alarmeDiaAtivo = -1;
int alarmeTurnoAtivo = -1;
unsigned long tempoInicioAlarme = 0;
unsigned long ultimoMillisBipe = 0;
bool estadoBipe = false;
const unsigned long TIMEOUT_ALARME_MS = 60000; // Desliga sozinho após 60s se ninguém apertar

// Buffer de recepção Serial
String bufferSerial = "";

// Protótipos das Funções
void processarComandoSerial(String comando);
void atualizarRelogioInterno();
void verificarAlarmesProgramados();
void dispararAlarme(int dia, int turno);
void pararAlarme();
void atualizarEfeitosAlarme();
void acenderCompartimento(int dia, int turno);
void apagarTodosLEDs();

// ==============================================================================
// SETUP: Inicialização dos pinos e comunicação Serial
// ==============================================================================
void setup() {
  Serial.begin(9600);

  // Configuração dos pinos da Matriz de LEDs como Saída (iniciando em nível BAIXO)
  for (int i = 0; i < 7; i++) {
    pinMode(PINOS_COLUNAS_DIAS[i], OUTPUT);
    digitalWrite(PINOS_COLUNAS_DIAS[i], LOW);
  }

  for (int j = 0; j < 4; j++) {
    pinMode(PINOS_LINHAS_TURNOS[j], OUTPUT);
    digitalWrite(PINOS_LINHAS_TURNOS[j], LOW);
  }

  // Configuração do Buzzer e do Botão de Confirmação
  pinMode(PINO_BUZZER, OUTPUT);
  digitalWrite(PINO_BUZZER, LOW);

  pinMode(PINO_BOTAO, INPUT_PULLUP); // Botão com resistor de pull-up interno (LOW quando pressionado)

  // Inicializa a tabela de alarmes vazia
  for (int i = 0; i < MAX_ALARMES; i++) {
    tabelaAlarmes[i].ativo = false;
  }

  apagarTodosLEDs();
  
  // Apito rápido de inicialização do sistema
  tone(PINO_BUZZER, 1800, 150);
  delay(200);
  tone(PINO_BUZZER, 2400, 150);

  Serial.println(F("[ARDUINO]: Caixa de Remedios Inteligente 7x4 Pronta."));
}

// ==============================================================================
// LOOP: Execução contínua e não-bloqueante
// ==============================================================================
void loop() {
  // 1. Leitura de Comandos da Porta Serial (sem travar a CPU)
  while (Serial.available() > 0) {
    char c = Serial.read();
    if (c == '\n' || c == '\r') {
      if (bufferSerial.length() > 0) {
        processarComandoSerial(bufferSerial);
        bufferSerial = "";
      }
    } else {
      bufferSerial += c;
    }
  }

  // 2. Atualiza a contagem dos segundos do relógio interno
  atualizarRelogioInterno();

  // 3. Verifica se algum alarme da tabela coincide com o horário atual
  verificarAlarmesProgramados();

  // 4. Se houver alarme ativo, pisca o LED e apita o Buzzer de forma intermitente
  if (alarmeEmExecucao) {
    atualizarEfeitosAlarme();

    // Verifica se o paciente apertou o botão físico para silenciar
    if (digitalRead(PINO_BOTAO) == LOW) {
      Serial.println(F("BOTAO_PRESSIONADO: Remedio tomado!"));
      pararAlarme();
      delay(300); // Debounce simples
    }

    // Desliga automaticamente após timeout
    if (millis() - tempoInicioAlarme >= TIMEOUT_ALARME_MS) {
      Serial.println(F("[ARDUINO]: Timeout do alarme atingido."));
      pararAlarme();
    }
  }
}

// ==============================================================================
// FUNÇÃO DE LEITURA E PARSING DA STRING SERIAL
// ==============================================================================
void processarComandoSerial(String comando) {
  comando.trim();
  if (comando.length() == 0) return;

  // --------------------------------------------------------------------------
  // COMANDO 1: TIME:<dia>,<hora>,<minuto>,<segundo>
  // Sincroniza o relógio do Arduino com o relógio do computador
  // --------------------------------------------------------------------------
  if (comando.startsWith("TIME:")) {
    String payload = comando.substring(5); // Remove "TIME:"
    int virgula1 = payload.indexOf(',');
    int virgula2 = payload.indexOf(',', virgula1 + 1);
    int virgula3 = payload.indexOf(',', virgula2 + 1);

    if (virgula1 > 0 && virgula2 > 0 && virgula3 > 0) {
      relogioDia     = payload.substring(0, virgula1).toInt();
      relogioHora    = payload.substring(virgula1 + 1, virgula2).toInt();
      relogioMinuto  = payload.substring(virgula2 + 1, virgula3).toInt();
      relogioSegundo = payload.substring(virgula3 + 1).toInt();

      Serial.print(F("[ARDUINO]: Relogio sincronizado -> Dia: "));
      Serial.print(relogioDia);
      Serial.print(F(" Hora: "));
      Serial.print(relogioHora);
      Serial.print(F(":"));
      if (relogioMinuto < 10) Serial.print('0');
      Serial.println(relogioMinuto);
    }
  }

  // --------------------------------------------------------------------------
  // COMANDO 2: SYNC:<dia>,<turno>,<hora>,<minuto>
  // Adiciona ou atualiza um agendamento na tabela de alarmes da caixa
  // --------------------------------------------------------------------------
  else if (comando.startsWith("SYNC:")) {
    String payload = comando.substring(5); // Remove "SYNC:"
    int virgula1 = payload.indexOf(',');
    int virgula2 = payload.indexOf(',', virgula1 + 1);
    int virgula3 = payload.indexOf(',', virgula2 + 1);

    if (virgula1 > 0 && virgula2 > 0 && virgula3 > 0) {
      uint8_t d = payload.substring(0, virgula1).toInt();
      uint8_t t = payload.substring(virgula1 + 1, virgula2).toInt();
      uint8_t h = payload.substring(virgula2 + 1, virgula3).toInt();
      uint8_t m = payload.substring(virgula3 + 1).toInt();

      // Procura se já existe alarme para esse compartimento (dia, turno)
      int indiceSalvar = -1;
      for (int i = 0; i < totalAlarmes; i++) {
        if (tabelaAlarmes[i].dia == d && tabelaAlarmes[i].turno == t) {
          indiceSalvar = i;
          break;
        }
      }

      // Se não encontrou e ainda há espaço na tabela
      if (indiceSalvar == -1 && totalAlarmes < MAX_ALARMES) {
        indiceSalvar = totalAlarmes;
        totalAlarmes++;
      }

      if (indiceSalvar != -1) {
        tabelaAlarmes[indiceSalvar].dia = d;
        tabelaAlarmes[indiceSalvar].turno = t;
        tabelaAlarmes[indiceSalvar].hora = h;
        tabelaAlarmes[indiceSalvar].minuto = m;
        tabelaAlarmes[indiceSalvar].ativo = true;

        Serial.print(F("[ARDUINO]: Alarme armazenado [Dia: "));
        Serial.print(d);
        Serial.print(F(", Turno: "));
        Serial.print(t);
        Serial.print(F("] as "));
        Serial.print(h);
        Serial.print(F(":"));
        if (m < 10) Serial.print('0');
        Serial.println(m);
      }
    }
  }

  // --------------------------------------------------------------------------
  // COMANDO 3: TRIGGER:<dia>,<turno>
  // Dispara imediatamente o LED e o Buzzer do compartimento especificado
  // --------------------------------------------------------------------------
  else if (comando.startsWith("TRIGGER:")) {
    String payload = comando.substring(8); // Remove "TRIGGER:"
    int virgula = payload.indexOf(',');
    if (virgula > 0) {
      int d = payload.substring(0, virgula).toInt();
      int t = payload.substring(virgula + 1).toInt();
      dispararAlarme(d, t);
    }
  }

  // --------------------------------------------------------------------------
  // COMANDO 4: STOP
  // Desliga o alarme sonoro e visual
  // --------------------------------------------------------------------------
  else if (comando.equalsIgnoreCase("STOP")) {
    pararAlarme();
  }

  // --------------------------------------------------------------------------
  // COMANDO 5: CLEAR
  // Limpa todos os alarmes da memória
  // --------------------------------------------------------------------------
  else if (comando.equalsIgnoreCase("CLEAR")) {
    totalAlarmes = 0;
    for (int i = 0; i < MAX_ALARMES; i++) {
      tabelaAlarmes[i].ativo = false;
    }
    Serial.println(F("[ARDUINO]: Todos os alarmes foram limpos da memoria."));
  }
}

// ==============================================================================
// CONTROLE DO HARDWARE: LEDS E BUZZER
// ==============================================================================

/** Ativa o alarme para as coordenadas (dia, turno) na matriz física 7x4 */
void dispararAlarme(int dia, int turno) {
  if (dia < 0 || dia > 6 || turno < 0 || turno > 3) return;

  alarmeEmExecucao = true;
  alarmeDiaAtivo = dia;
  alarmeTurnoAtivo = turno;
  tempoInicioAlarme = millis();
  ultimoMillisBipe = millis();
  estadoBipe = true;

  acenderCompartimento(dia, turno);
  tone(PINO_BUZZER, 2000); // Primeiro tom de alerta

  Serial.print(F("[ARDUINO]: ALARME DISPARADO -> Dia "));
  Serial.print(dia);
  Serial.print(F(" | Turno "));
  Serial.println(turno);
}

/** Desliga o alarme sonoro e apaga os LEDs */
void pararAlarme() {
  alarmeEmExecucao = false;
  alarmeDiaAtivo = -1;
  alarmeTurnoAtivo = -1;

  noTone(PINO_BUZZER);
  digitalWrite(PINO_BUZZER, LOW);
  apagarTodosLEDs();

  Serial.println(F("[ARDUINO]: Alarme desligado."));
}

/**
 * Cria o efeito de pulso/bipe intermitente no Buzzer e LED sem usar delay()
 * Padrão agradável para idosos: 400ms ligado, 400ms desligado
 */
void atualizarEfeitosAlarme() {
  unsigned long agora = millis();
  if (agora - ultimoMillisBipe >= 400) {
    ultimoMillisBipe = agora;
    estadoBipe = !estadoBipe;

    if (estadoBipe) {
      tone(PINO_BUZZER, 2200); // Frequência nítida de alerta
      acenderCompartimento(alarmeDiaAtivo, alarmeTurnoAtivo);
    } else {
      noTone(PINO_BUZZER);
      digitalWrite(PINO_BUZZER, LOW);
      apagarTodosLEDs(); // Efeito de piscar o LED
    }
  }
}

/**
 * Acende o LED na interseção da Linha (Turno) com a Coluna (Dia)
 * Em uma matriz com ânodos nas colunas e cátodos nas linhas (ou acionamento direto):
 * Coluna = HIGH, Linha = LOW (ou circuito com transistores/resistores)
 */
void acenderCompartimento(int dia, int turno) {
  apagarTodosLEDs();
  if (dia >= 0 && dia < 7 && turno >= 0 && turno < 4) {
    digitalWrite(PINOS_COLUNAS_DIAS[dia], HIGH);
    digitalWrite(PINOS_LINHAS_TURNOS[turno], HIGH);
  }
}

/** Apaga todos os pinos de saída dos LEDs */
void apagarTodosLEDs() {
  for (int i = 0; i < 7; i++) {
    digitalWrite(PINOS_COLUNAS_DIAS[i], LOW);
  }
  for (int j = 0; j < 4; j++) {
    digitalWrite(PINOS_LINHAS_TURNOS[j], LOW);
  }
}

// ==============================================================================
// RELÓGIO INTERNO E VERIFICAÇÃO AUTÔNOMA DE ALARMES
// ==============================================================================
void atualizarRelogioInterno() {
  unsigned long agora = millis();
  if (agora - ultimoMillisRelogio >= 1000) {
    ultimoMillisRelogio = agora;
    relogioSegundo++;

    if (relogioSegundo >= 60) {
      relogioSegundo = 0;
      relogioMinuto++;

      if (relogioMinuto >= 60) {
        relogioMinuto = 0;
        relogioHora++;

        if (relogioHora >= 24) {
          relogioHora = 0;
          relogioDia = (relogioDia + 1) % 7;
        }
      }
    }
  }
}

/** Verifica se o minuto corrente coincide com algum alarme gravado na tabela */
void verificarAlarmesProgramados() {
  // Apenas verifica na virada de cada minuto (segundo == 0) e se não estiver em alarme
  if (relogioSegundo != 0 || alarmeEmExecucao) return;

  for (int i = 0; i < totalAlarmes; i++) {
    if (tabelaAlarmes[i].ativo &&
        tabelaAlarmes[i].dia == relogioDia &&
        tabelaAlarmes[i].hora == relogioHora &&
        tabelaAlarmes[i].minuto == relogioMinuto) {
      dispararAlarme(tabelaAlarmes[i].dia, tabelaAlarmes[i].turno);
      break;
    }
  }
}
