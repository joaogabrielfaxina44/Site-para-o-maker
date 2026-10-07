"""
==============================================================================
PONTE DE COMUNICAÇÃO SERIAL (PC <-> ARDUINO UNO)
Caixa de Remédios Inteligente 7x4
==============================================================================
Este script atua como o elo de ligação entre o servidor web / banco de dados
e o microcontrolador Arduino Uno conectado via cabo USB.

Funcionalidades:
1. Autodetecta ou conecta na porta Serial especificada (ex: COM3, COM4, /dev/ttyACM0).
2. Sincroniza o relógio em tempo real do Arduino (TIME:<dia>,<hora>,<minuto>,<segundo>).
3. Transmite periodicamente os alarmes ativos (SYNC:<dia>,<turno>,<hora>,<minuto>).
4. Monitora o relógio e envia comando de disparo em tempo real (TRIGGER:<dia>,<turno>).
5. Ouve confirmações de botão do paciente no Arduino (ex: confirmação de dose tomada).
"""

import sys
import time
import argparse
from datetime import datetime
import requests
import serial
import serial.tools.list_ports

# Configurações padrão
DEFAULT_API_URL = "http://localhost:8000"
DEFAULT_BAUD = 9600
INTERVALO_CONSULTA_SEGUNDOS = 10  # Intervalo de polling da API/Banco

def encontrar_porta_arduino():
    """Tenta detectar automaticamente a porta COM onde o Arduino Uno está conectado."""
    portas = serial.tools.list_ports.comports()
    for p in portas:
        descricao = f"{p.description} {p.manufacturer or ''}".lower()
        if "arduino" in descricao or "ch340" in descricao or "usb serial" in descricao or "ftdi" in descricao:
            print(f"[*] Arduino detectado na porta: {p.device} ({p.description})")
            return p.device
    
    if portas:
        print(f"[*] Nenhuma porta com nome explícito 'Arduino', usando primeira disponível: {portas[0].device}")
        return portas[0].device
    return None

class PonteSerialArduino:
    def __init__(self, porta_serial=None, baudrate=DEFAULT_BAUD, api_url=DEFAULT_API_URL):
        self.porta_serial = porta_serial
        self.baudrate = baudrate
        self.api_url = api_url
        self.conexao = None
        self.ultimo_minuto_disparado = None

    def conectar(self):
        """Estabelece a conexão serial com o Arduino."""
        while self.conexao is None or not self.conexao.is_open:
            porta = self.porta_serial or encontrar_porta_arduino()
            if not porta:
                print("[!] Nenhuma porta Serial encontrada. Conecte o cabo USB do Arduino e aguarde...")
                time.sleep(3)
                continue

            try:
                print(f"[+] Abrindo conexão com Arduino em {porta} a {self.baudrate} baud...")
                self.conexao = serial.Serial(porta, self.baudrate, timeout=1)
                # O Arduino Uno reinicia ao abrir a serial (DTR reset). Aguarda 2 segundos para estabilização.
                time.sleep(2)
                self.conexao.reset_input_buffer()
                print("[✔] Conexão Serial estabelecida com sucesso!")
                self.sincronizar_relogio()
                return True
            except (serial.SerialException, OSError) as e:
                print(f"[✖] Falha ao conectar na porta {porta}: {e}")
                print("[*] Tentando reconectar em 3 segundos...")
                time.sleep(3)

    def enviar_comando(self, comando: str):
        """Envia uma string de comando para o Arduino terminada em quebra de linha."""
        if not self.conexao or not self.conexao.is_open:
            return False
        try:
            linha = f"{comando.strip()}\n"
            self.conexao.write(linha.encode("ascii"))
            self.conexao.flush()
            print(f"[TX -> Arduino] {comando}")
            return True
        except serial.SerialException as e:
            print(f"[!] Erro ao enviar comando serial: {e}")
            self.conexao = None
            return False

    def ler_respostas_arduino(self):
        """Lê mensagens ou confirmações de botões vindas do Arduino (RX)."""
        if not self.conexao or not self.conexao.is_open:
            return

        try:
            while self.conexao.in_waiting > 0:
                linha = self.conexao.readline().decode("utf-8", errors="replace").strip()
                if linha:
                    print(f"[RX <- Arduino] {linha}")
                    # Se o idoso apertou o botão físico para desligar o alarme
                    if linha.startswith("BOTAO_PRESSIONADO"):
                        print("[ℹ] Paciente confirmou a ingestão do medicamento na caixa!")
        except Exception as e:
            print(f"[!] Erro ao ler da porta serial: {e}")

    def sincronizar_relogio(self):
        """
        Envia a hora atual do PC para o Arduino.
        Formato: TIME:<dia_semana_0_a_6>,<hora>,<minuto>,<segundo>
        Exemplo: TIME:1,08,30,00
        """
        agora = datetime.now()
        # No Python: Monday é 0, Sunday é 6.
        # No nosso sistema: 0=Domingo, 1=Segunda ... 6=Sábado.
        dia_semana_sistema = (agora.weekday() + 1) % 7

        cmd = f"TIME:{dia_semana_sistema},{agora.hour:02d},{agora.minute:02d},{agora.second:02d}"
        self.enviar_comando(cmd)

    def buscar_alarmes_api(self):
        """Consulta a API REST para obter todos os alarmes ativos cadastrados."""
        try:
            resposta = requests.get(f"{self.api_url}/api/alarmes/ativos", timeout=4)
            if resposta.status_code == 200:
                dados = resposta.json()
                return dados.get("alarmes", [])
        except requests.RequestException as e:
            print(f"[!] Não foi possível consultar a API Web ({self.api_url}): {e}")
        return []

    def sincronizar_tabela_alarmes(self, alarmes):
        """
        Transmite todos os alarmes ativos para a memória do Arduino.
        Comando: SYNC:<dia>,<turno>,<hora>,<minuto>
        """
        if not alarmes:
            return

        print(f"[*] Sincronizando {len(alarmes)} alarme(s) com o Arduino...")
        for alarme in alarmes:
            dia = alarme["dia"]
            turno = alarme["turno"]
            hora = alarme["hora"]
            minuto = alarme["minuto"]
            cmd = f"SYNC:{dia},{turno},{hora:02d},{minuto:02d}"
            self.enviar_comando(cmd)
            time.sleep(0.05)  # Pequeno respiro para o buffer do Arduino

    def verificar_disparos_imediatos(self, alarmes):
        """
        Compara o horário atual do relógio com os alarmes programados.
        Quando o minuto coincide, envia o comando TRIGGER:<dia>,<turno> para acender o LED e soar o buzzer.
        """
        agora = datetime.now()
        dia_atual = (agora.weekday() + 1) % 7
        hora_atual = agora.hour
        minuto_atual = agora.minute

        chave_minuto_atual = f"{dia_atual}-{hora_atual:02d}:{minuto_atual:02d}"

        # Evita disparar repetidamente dentro do mesmo minuto
        if self.ultimo_minuto_disparado == chave_minuto_atual:
            return

        for alarme in alarmes:
            if alarme["dia"] == dia_atual and alarme["hora"] == hora_atual and alarme["minuto"] == minuto_atual:
                print(f"[🔔 ALARME ATIVADO!] Medicamento: {alarme['remedio']} | Dia: {dia_atual} | Turno: {alarme['turno']}")
                cmd = f"TRIGGER:{alarme['dia']},{alarme['turno']}"
                self.enviar_comando(cmd)
                self.ultimo_minuto_disparado = chave_minuto_atual
                break

    def executar(self):
        """Loop principal da ponte de comunicação serial."""
        print("=" * 60)
        print("  INICIANDO PONTE SERIAL - CAIXA DE REMÉDIOS 7x4")
        print("=" * 60)
        
        self.conectar()
        ultimo_sync = 0

        try:
            while True:
                # Se a conexão caiu por desconexão física do cabo USB
                if not self.conexao or not self.conexao.is_open:
                    print("[!] Conexão perdida. Tentando restabelecer...")
                    self.conectar()

                # Processa mensagens recebidas do Arduino
                self.ler_respostas_arduino()

                agora_ts = time.time()
                # A cada intervalo pré-definido, consulta a API e sincroniza
                if agora_ts - ultimo_sync >= INTERVALO_CONSULTA_SEGUNDOS:
                    alarmes = self.buscar_alarmes_api()
                    if alarmes:
                        self.sincronizar_tabela_alarmes(alarmes)
                    self.sincronizar_relogio()
                    ultimo_sync = agora_ts

                    # Verifica se algum alarme deve soar neste exato minuto
                    self.verificar_disparos_imediatos(alarmes)

                time.sleep(1)

        except KeyboardInterrupt:
            print("\n[*] Encerrando ponte serial...")
            if self.conexao and self.conexao.is_open:
                self.conexao.close()
            print("[✔] Conexão encerrada com segurança.")


def main():
    parser = argparse.ArgumentParser(description="Ponte de comunicação Serial entre o Servidor Web e o Arduino Uno.")
    parser.add_argument("--port", "-p", help="Porta Serial do Arduino (ex: COM3, COM4, /dev/ttyACM0). Se omitida, autodetecta.")
    parser.add_argument("--baud", "-b", type=int, default=DEFAULT_BAUD, help="Baudrate da comunicação (padrão: 9600).")
    parser.add_argument("--api", "-a", default=DEFAULT_API_URL, help="URL da API Web (padrão: http://localhost:8000).")
    parser.add_argument("--test", "-t", nargs=2, type=int, metavar=("DIA", "TURNO"), help="Dispara um teste rápido no compartimento (ex: --test 1 0)")

    args = parser.parse_args()

    ponte = PonteSerialArduino(porta_serial=args.port, baudrate=args.baud, api_url=args.api)

    if args.test is not None:
        dia, turno = args.test
        print(f"[*] Disparando teste manual: Dia={dia}, Turno={turno}...")
        ponte.conectar()
        ponte.enviar_comando(f"TRIGGER:{dia},{turno}")
        time.sleep(1)
        ponte.ler_respostas_arduino()
        sys.exit(0)

    ponte.executar()


if __name__ == "__main__":
    main()
