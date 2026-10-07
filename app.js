/**
 * ==============================================================================
 * APLICAÇÃO FRONTEND - CAIXA DE REMÉDIOS INTELIGENTE 7x4
 * Suporte Completo a GitHub Pages, LocalStorage e Web Serial API (Navegador <-> Arduino)
 * ==============================================================================
 */

// Detecta se está rodando no GitHub Pages ou ambiente estático
const IS_GITHUB_PAGES = window.location.hostname.includes("github.io") || window.location.protocol === "file:";
const API_BASE = IS_GITHUB_PAGES ? "" : "";

// Mapeamentos para os 7 dias (Eixo X) e 4 turnos (Eixo Y)
const DIAS_NOMES = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const DIAS_ABREV = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const TURNOS_NOMES = ["Manhã", "Tarde", "Noite", "Cama"];
const TURNOS_ICONES = ["ph-sun-horizon", "ph-sun", "ph-moon-stars", "ph-bed"];

// Chave do LocalStorage para funcionamento offline e no GitHub Pages
const STORAGE_KEY = "caixa_remedios_lembretes";

// Estado da Aplicação
let lembretes = [];
let lembreteEmEdicao = null;
let lembreteParaExcluir = null;
let usandoLocalStorage = IS_GITHUB_PAGES;

// Estado da Web Serial API
let serialPort = null;
let isSerialConnected = false;
let serialReader = null;
let serialWriter = null;

// Elementos DOM principais
const form = document.getElementById("formLembrete");
const editIdInput = document.getElementById("editLembreteId");
const nomeInput = document.getElementById("nomeRemedio");
const horarioInput = document.getElementById("horarioExato");
const observacoesInput = document.getElementById("observacoes");
const btnSalvar = document.getElementById("btnSalvar");
const btnSalvarTexto = document.getElementById("btnSalvarTexto");
const btnCancelarEdicao = document.getElementById("btnCancelarEdicao");
const tabelaCorpo = document.getElementById("tabelaCorpo");
const emptyState = document.getElementById("emptyState");
const matrixBody = document.getElementById("matrixBody");
const filtroInput = document.getElementById("filtroRemedio");
const toastContainer = document.getElementById("toastContainer");
const themeToggle = document.getElementById("themeToggle");
const modalExcluir = document.getElementById("modalExcluir");
const modalExcluirMsg = document.getElementById("modalExcluirMsg");
const btnModalConfirmar = document.getElementById("btnModalConfirmar");
const btnModalCancelar = document.getElementById("btnModalCancelar");
const btnConectarSerial = document.getElementById("btnConectarSerial");
const serialBtnText = document.getElementById("serialBtnText");
const serialIcon = document.getElementById("serialIcon");
const statusBadge = document.getElementById("arduinoStatus");
const statusText = document.getElementById("statusText");

// Botões de Seleção Rápida de Dias
const btnTodosDias = document.getElementById("btnTodosDias");
const btnDiasUteis = document.getElementById("btnDiasUteis");
const btnFimSemana = document.getElementById("btnFimSemana");
const btnLimparDias = document.getElementById("btnLimparDias");

// Inicialização ao carregar a página
document.addEventListener("DOMContentLoaded", () => {
  configurarEventos();
  verificarTemaSalvo();
  carregarLembretes();
  iniciarMonitoramentoAlarmes();
});

// ==============================================================================
// CONFIGURAÇÃO DE EVENTOS
// ==============================================================================
function configurarEventos() {
  // Envio do Formulário
  form.addEventListener("submit", manipularEnvioFormulario);

  // Cancelar Edição
  btnCancelarEdicao.addEventListener("click", cancelarEdicao);

  // Seleção rápida de dias
  btnTodosDias.addEventListener("click", () => marcarDias([0, 1, 2, 3, 4, 5, 6]));
  btnDiasUteis.addEventListener("click", () => marcarDias([1, 2, 3, 4, 5]));
  btnFimSemana.addEventListener("click", () => marcarDias([0, 6]));
  btnLimparDias.addEventListener("click", () => marcarDias([]));

  // Filtro de busca na tabela
  filtroInput.addEventListener("input", filtrarTabela);

  // Botão Atualizar Matriz
  document.getElementById("btnAtualizarMatriz").addEventListener("click", carregarLembretes);

  // Modal de Exclusão
  btnModalCancelar.addEventListener("click", fecharModalExcluir);
  btnModalConfirmar.addEventListener("click", executarExclusao);

  // Alternar tema Alto Contraste
  themeToggle.addEventListener("click", alternarAltoContraste);

  // Conectar Arduino via Web Serial API
  if (btnConectarSerial) {
    btnConectarSerial.addEventListener("click", toggleConexaoWebSerial);
  }
}

// ==============================================================================
// GERENCIAMENTO DE DADOS (HÍBRIDO: API BACKEND OU LOCALSTORAGE / GITHUB PAGES)
// ==============================================================================

/** Dados de exemplo caso esteja no GitHub Pages e ainda vazio */
const DADOS_EXEMPLO_PADRAO = [
  { id: 1, grupo_id: "demo-1", nome_remedio: "Losartana 50mg", dia_semana: 1, turno: 0, horario: "08:00", ativo: true, observacoes: "Tomar após o café" },
  { id: 2, grupo_id: "demo-1", nome_remedio: "Losartana 50mg", dia_semana: 2, turno: 0, horario: "08:00", ativo: true, observacoes: "Tomar após o café" },
  { id: 3, grupo_id: "demo-1", nome_remedio: "Losartana 50mg", dia_semana: 3, turno: 0, horario: "08:00", ativo: true, observacoes: "Tomar após o café" },
  { id: 4, grupo_id: "demo-2", nome_remedio: "Metformina 850mg", dia_semana: 1, turno: 1, horario: "12:30", ativo: true, observacoes: "Com o almoço" },
  { id: 5, grupo_id: "demo-3", nome_remedio: "Sinvastatina 20mg", dia_semana: 1, turno: 2, horario: "20:00", ativo: true, observacoes: "À noite" },
  { id: 6, grupo_id: "demo-4", nome_remedio: "Melatonina 3mg", dia_semana: 1, turno: 3, horario: "22:30", ativo: true, observacoes: "Ao deitar" }
];

function obterLembretesLocalStorage() {
  const salvo = localStorage.getItem(STORAGE_KEY);
  if (!salvo) {
    salvarLembretesLocalStorage(DADOS_EXEMPLO_PADRAO);
    return DADOS_EXEMPLO_PADRAO;
  }
  try {
    return JSON.parse(salvo);
  } catch (e) {
    return DADOS_EXEMPLO_PADRAO;
  }
}

function salvarLembretesLocalStorage(dados) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(dados));
}

/** Carrega os lembretes com fallback para LocalStorage */
async function carregarLembretes() {
  if (IS_GITHUB_PAGES) {
    usandoLocalStorage = true;
    lembretes = obterLembretesLocalStorage();
    atualizarTabela(lembretes);
    atualizarMatriz7x4(lembretes);
    atualizarStatusModo("GitHub Pages (Offline/Local)");
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/api/lembretes`);
    if (!res.ok) throw new Error("API indisponível");
    
    lembretes = await res.json();
    usandoLocalStorage = false;
    atualizarTabela(lembretes);
    atualizarMatriz7x4(lembretes);
    atualizarStatusModo("API Backend Conectada");
  } catch (erro) {
    // Se a API não respondeu, utiliza o LocalStorage automaticamente
    usandoLocalStorage = true;
    lembretes = obterLembretesLocalStorage();
    atualizarTabela(lembretes);
    atualizarMatriz7x4(lembretes);
    atualizarStatusModo("Modo Local (LocalStorage)");
  }
}

function atualizarStatusModo(modo) {
  if (statusText) {
    statusText.textContent = modo;
  }
}

/** Salva novo lembrete ou atualiza lembrete existente */
async function manipularEnvioFormulario(e) {
  e.preventDefault();

  const nome = nomeInput.value.trim();
  const horario = horarioInput.value;
  const observacoes = observacoesInput.value.trim();
  const turnoSelecionado = document.querySelector('input[name="turno"]:checked');

  const checkboxesDias = document.querySelectorAll('input[name="diasSemana"]:checked');
  const dias = Array.from(checkboxesDias).map(cb => parseInt(cb.value, 10));

  if (!nome) {
    mostrarToast("Por favor, informe o nome do medicamento.", "error");
    nomeInput.focus();
    return;
  }

  if (dias.length === 0) {
    mostrarToast("Por favor, selecione pelo menos um dia da semana.", "error");
    document.querySelector('input[name="diasSemana"]').focus();
    return;
  }

  if (!turnoSelecionado) {
    mostrarToast("Por favor, escolha um dos turnos (Manhã, Tarde, Noite ou Cama).", "error");
    return;
  }

  if (!horario) {
    mostrarToast("Por favor, defina o horário do alarme.", "error");
    horarioInput.focus();
    return;
  }

  const turno = parseInt(turnoSelecionado.value, 10);
  btnSalvar.disabled = true;

  try {
    if (usandoLocalStorage) {
      salvarNoLocalStorage(nome, dias, turno, horario, observacoes);
    } else {
      await salvarNaAPI(nome, dias, turno, horario, observacoes);
    }

    // Se estiver conectado via Web Serial, sincroniza os alarmes no Arduino
    if (isSerialConnected) {
      sincronizarTodosAlarmesArduino();
    }
  } catch (erro) {
    console.error("Erro ao salvar:", erro);
    mostrarToast("Ocorreu um erro ao salvar o lembrete.", "error");
  } finally {
    btnSalvar.disabled = false;
  }
}

function salvarNoLocalStorage(nome, dias, turno, horario, observacoes) {
  let lista = obterLembretesLocalStorage();

  if (lembreteEmEdicao) {
    const idx = lista.findIndex(l => l.id === lembreteEmEdicao.id);
    if (idx !== -1) {
      lista[idx].nome_remedio = nome;
      lista[idx].dia_semana = dias[0];
      lista[idx].turno = turno;
      lista[idx].horario = horario;
      lista[idx].observacoes = observacoes || null;
    }
    mostrarToast("Lembrete atualizado com sucesso!", "success");
    cancelarEdicao();
  } else {
    const grupoId = "grp_" + Date.now();
    dias.forEach((dia, i) => {
      lista.push({
        id: Date.now() + i,
        grupo_id: grupoId,
        nome_remedio: nome,
        dia_semana: dia,
        turno: turno,
        horario: horario,
        ativo: true,
        observacoes: observacoes || null
      });
    });
    mostrarToast(`${dias.length} lembrete(s) cadastrado(s) com sucesso!`, "success");
    resetarFormulario();
  }

  salvarLembretesLocalStorage(lista);
  lembretes = lista;
  atualizarTabela(lembretes);
  atualizarMatriz7x4(lembretes);
}

async function salvarNaAPI(nome, dias, turno, horario, observacoes) {
  if (lembreteEmEdicao) {
    const payload = {
      nome_remedio: nome,
      dia_semana: dias[0],
      turno: turno,
      horario: horario,
      observacoes: observacoes || null
    };
    const res = await fetch(`${API_BASE}/api/lembretes/${lembreteEmEdicao.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error("Falha ao atualizar na API");
    mostrarToast("Lembrete atualizado com sucesso!", "success");
    cancelarEdicao();
  } else {
    const payload = {
      nome_remedio: nome,
      dias_semana: dias,
      turno: turno,
      horario: horario,
      ativo: true,
      observacoes: observacoes || null
    };
    const res = await fetch(`${API_BASE}/api/lembretes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error("Falha ao criar na API");
    mostrarToast(`${dias.length} lembrete(s) cadastrado(s) com sucesso!`, "success");
    resetarFormulario();
  }
  await carregarLembretes();
}

/** Prepara o formulário para editar um item específico */
function iniciarEdicao(id) {
  const item = lembretes.find(l => l.id === id);
  if (!item) return;

  lembreteEmEdicao = item;
  editIdInput.value = item.id;
  nomeInput.value = item.nome_remedio;
  horarioInput.value = item.horario;
  observacoesInput.value = item.observacoes || "";

  marcarDias([item.dia_semana]);

  const radioTurno = document.querySelector(`input[name="turno"][value="${item.turno}"]`);
  if (radioTurno) radioTurno.checked = true;

  btnSalvarTexto.textContent = "Salvar Alterações";
  btnCancelarEdicao.style.display = "inline-flex";

  document.getElementById("formTitulo").scrollIntoView({ behavior: "smooth" });
  nomeInput.focus();
}

function cancelarEdicao() {
  lembreteEmEdicao = null;
  resetarFormulario();
  btnSalvarTexto.textContent = "Salvar e Programar Caixa";
  btnCancelarEdicao.style.display = "none";
}

function resetarFormulario() {
  form.reset();
  editIdInput.value = "";
  horarioInput.value = "08:00";
  const primeiroTurno = document.querySelector('input[name="turno"][value="0"]');
  if (primeiroTurno) primeiroTurno.checked = true;
  marcarDias([]);
}

/** Alterna status Ativo/Inativo */
async function alternarStatus(id, statusAtual) {
  try {
    if (usandoLocalStorage) {
      let lista = obterLembretesLocalStorage();
      const item = lista.find(l => l.id === id);
      if (item) item.ativo = !statusAtual;
      salvarLembretesLocalStorage(lista);
      lembretes = lista;
      atualizarTabela(lembretes);
      atualizarMatriz7x4(lembretes);
    } else {
      await fetch(`${API_BASE}/api/lembretes/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ativo: !statusAtual })
      });
      await carregarLembretes();
    }
    mostrarToast(`Alarme ${!statusAtual ? "ativado" : "desativado"} com sucesso!`, "info");
    if (isSerialConnected) sincronizarTodosAlarmesArduino();
  } catch (erro) {
    mostrarToast("Não foi possível alterar o status do alarme.", "error");
  }
}

/** Abre modal para confirmar exclusão */
function solicitarExclusao(id) {
  const item = lembretes.find(l => l.id === id);
  if (!item) return;

  lembreteParaExcluir = item;
  modalExcluirMsg.innerHTML = `
    Deseja realmente remover o alarme de <strong>${escapeHTML(item.nome_remedio)}</strong> 
    programado para <strong>${DIAS_NOMES[item.dia_semana]}</strong> 
    no turno <strong>${TURNOS_NOMES[item.turno]} (${item.horario})</strong>?
  `;
  modalExcluir.style.display = "flex";
  btnModalConfirmar.focus();
}

function fecharModalExcluir() {
  lembreteParaExcluir = null;
  modalExcluir.style.display = "none";
}

async function executarExclusao() {
  if (!lembreteParaExcluir) return;

  try {
    if (usandoLocalStorage) {
      let lista = obterLembretesLocalStorage();
      lista = lista.filter(l => l.id !== lembreteParaExcluir.id);
      salvarLembretesLocalStorage(lista);
      lembretes = lista;
      atualizarTabela(lembretes);
      atualizarMatriz7x4(lembretes);
    } else {
      await fetch(`${API_BASE}/api/lembretes/${lembreteParaExcluir.id}`, { method: "DELETE" });
      await carregarLembretes();
    }

    mostrarToast("Lembrete removido com sucesso!", "success");
    fecharModalExcluir();
    if (isSerialConnected) sincronizarTodosAlarmesArduino();
  } catch (erro) {
    mostrarToast("Falha ao excluir o lembrete.", "error");
  }
}

// ==============================================================================
// INTEGRAÇÃO COM WEB SERIAL API (DIRETO NO NAVEGADOR VIA USB NO GITHUB PAGES)
// ==============================================================================

async function toggleConexaoWebSerial() {
  if (!("serial" in navigator)) {
    mostrarToast("Seu navegador não suporta Web Serial. Use Google Chrome ou Microsoft Edge via cabo USB.", "error");
    return;
  }

  if (isSerialConnected) {
    await desconectarWebSerial();
  } else {
    await conectarWebSerial();
  }
}

async function conectarWebSerial() {
  try {
    mostrarToast("Selecione a porta COM do Arduino Uno na janela do navegador...", "info");
    serialPort = await navigator.serial.requestPort();
    await serialPort.open({ baudRate: 9600 });

    isSerialConnected = true;
    atualizarInterfaceSerial(true);
    mostrarToast("Arduino Uno conectado com sucesso via USB!", "success");

    iniciarLeituraWebSerial();

    // Sincroniza o relógio e alarmes após 2 segundos (estabilização do reset do Arduino)
    setTimeout(() => {
      sincronizarRelogioArduino();
      sincronizarTodosAlarmesArduino();
    }, 2000);

  } catch (erro) {
    console.warn("Conexão cancelada ou erro:", erro);
    if (erro.name !== "NotFoundError") {
      mostrarToast("Não foi possível conectar à porta serial.", "error");
    }
  }
}

async function desconectarWebSerial() {
  try {
    isSerialConnected = false;
    if (serialReader) {
      await serialReader.cancel();
    }
    if (serialPort) {
      await serialPort.close();
      serialPort = null;
    }
    atualizarInterfaceSerial(false);
    mostrarToast("Conexão com o Arduino encerrada.", "info");
  } catch (erro) {
    console.error("Erro ao fechar serial:", erro);
  }
}

function atualizarInterfaceSerial(conectado) {
  if (conectado) {
    btnConectarSerial.classList.add("connected");
    serialBtnText.textContent = "Arduino Conectado (USB)";
    serialIcon.className = "ph-bold ph-check-circle";
    statusBadge.classList.add("connected");
  } else {
    btnConectarSerial.classList.remove("connected");
    serialBtnText.textContent = "Conectar Arduino (USB)";
    serialIcon.className = "ph-bold ph-usb";
    statusBadge.classList.remove("connected");
  }
}

async function enviarComandoSerial(comando) {
  if (!isSerialConnected || !serialPort || !serialPort.writable) {
    return false;
  }
  try {
    const encoder = new TextEncoder();
    const writer = serialPort.writable.getWriter();
    await writer.write(encoder.encode(comando.trim() + "\n"));
    writer.releaseLock();
    console.log("[WebSerial TX]", comando);
    return true;
  } catch (erro) {
    console.error("Erro ao enviar comando serial:", erro);
    return false;
  }
}

async function iniciarLeituraWebSerial() {
  while (serialPort && serialPort.readable && isSerialConnected) {
    const textDecoder = new TextDecoderStream();
    const readableStreamClosed = serialPort.readable.pipeTo(textDecoder.writable);
    const reader = textDecoder.readable.getReader();
    serialReader = reader;

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value) {
          const linhas = value.split("\n");
          linhas.forEach(linha => {
            linha = linha.trim();
            if (linha) {
              console.log("[WebSerial RX]", linha);
              if (linha.includes("BOTAO_PRESSIONADO")) {
                mostrarToast("Paciente apertou o botão: Remédio tomado!", "success");
              }
            }
          });
        }
      }
    } catch (e) {
      console.warn("Stream de leitura encerrado:", e);
    } finally {
      reader.releaseLock();
    }
  }
}

/** Envia o horário atual do dispositivo para o Arduino */
function sincronizarRelogioArduino() {
  const agora = new Date();
  const diaSemana = agora.getDay(); // 0 = Domingo a 6 = Sábado
  const hh = String(agora.getHours()).padStart(2, "0");
  const mm = String(agora.getMinutes()).padStart(2, "0");
  const ss = String(agora.getSeconds()).padStart(2, "0");

  enviarComandoSerial(`TIME:${diaSemana},${hh},${mm},${ss}`);
}

/** Envia todos os alarmes ativos para a memória do Arduino */
function sincronizarTodosAlarmesArduino() {
  const ativos = lembretes.filter(l => l.ativo);
  console.log(`Sincronizando ${ativos.length} alarme(s) com o Arduino...`);
  
  ativos.forEach(l => {
    const [hh, mm] = l.horario.split(":");
    enviarComandoSerial(`SYNC:${l.dia_semana},${l.turno},${hh},${mm}`);
  });
}

/** Teste manual disparado pelo usuário */
async function testarCompartimento(dia, turno) {
  mostrarToast(`Disparando teste no compartimento [${DIAS_ABREV[dia]} - ${TURNOS_NOMES[turno]}]...`, "info");

  // Se o Arduino estiver conectado diretamente via Web Serial no navegador
  if (isSerialConnected) {
    const ok = await enviarComandoSerial(`TRIGGER:${dia},${turno}`);
    if (ok) {
      mostrarToast(`Comando enviado! LED e Buzzer acionados no Arduino!`, "success");
      return;
    }
  }

  // Caso contrário, tenta enviar para a API se ela estiver disponível
  if (!usandoLocalStorage) {
    try {
      const res = await fetch(`${API_BASE}/api/hardware/teste`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dia_semana: dia, turno: turno })
      });
      if (res.ok) {
        mostrarToast(`Sinal registrado na API para ${DIAS_NOMES[dia]} (${TURNOS_NOMES[turno]})!`, "success");
        return;
      }
    } catch (e) {}
  }

  mostrarToast(`Para ver o LED acender, conecte o Arduino pelo botão 'Conectar Arduino (USB)' ou execute o script Python.`, "info");
}

/** Monitoramento periódico de alarmes no navegador (em background) */
let ultimoMinutoDisparado = "";
function iniciarMonitoramentoAlarmes() {
  setInterval(() => {
    const agora = new Date();
    const diaAtual = agora.getDay();
    const hh = String(agora.getHours()).padStart(2, "0");
    const mm = String(agora.getMinutes()).padStart(2, "0");
    const horarioAtual = `${hh}:${mm}`;
    const chaveAtual = `${diaAtual}-${horarioAtual}`;

    if (chaveAtual === ultimoMinutoDisparado) return;

    // Procura se há alarme ativo neste minuto
    const alarmeDevido = lembretes.find(l => l.ativo && l.dia_semana === diaAtual && l.horario === horarioAtual);
    if (alarmeDevido) {
      ultimoMinutoDisparado = chaveAtual;
      mostrarToast(`🔔 HORA DO REMÉDIO: ${alarmeDevido.nome_remedio}!`, "success");
      if (isSerialConnected) {
        enviarComandoSerial(`TRIGGER:${alarmeDevido.dia_semana},${alarmeDevido.turno}`);
      }
    }
  }, 1000);
}

// ==============================================================================
// RENDERIZAÇÃO DA TABELA DE LEMBRETES
// ==============================================================================
function atualizarTabela(lista) {
  tabelaCorpo.innerHTML = "";

  if (lista.length === 0) {
    emptyState.style.display = "block";
    document.getElementById("tabelaLembretes").style.display = "none";
    return;
  }

  emptyState.style.display = "none";
  document.getElementById("tabelaLembretes").style.display = "table";

  lista.forEach(item => {
    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td>
        <span class="med-name">${escapeHTML(item.nome_remedio)}</span>
      </td>
      <td>
        <strong>${DIAS_NOMES[item.dia_semana] || "Dia " + item.dia_semana}</strong>
      </td>
      <td>
        <span class="badge-turno badge-turno-${item.turno}">
          <i class="ph-bold ${TURNOS_ICONES[item.turno]}"></i>
          ${TURNOS_NOMES[item.turno]}
        </span>
      </td>
      <td>
        <strong><i class="ph-bold ph-clock"></i> ${item.horario}</strong>
      </td>
      <td>
        <button 
          class="badge-status ${item.ativo ? 'active' : 'inactive'}" 
          onclick="alternarStatus(${item.id}, ${item.ativo})"
          title="Clique para alternar status do alarme"
          style="border: none; cursor: pointer;"
        >
          ${item.ativo ? '● Ativo' : '○ Pausado'}
        </button>
      </td>
      <td>
        <small>${item.observacoes ? escapeHTML(item.observacoes) : '<em>Nenhuma</em>'}</small>
      </td>
      <td class="text-right">
        <div class="cell-actions">
          <button 
            type="button" 
            class="btn-icon-action" 
            onclick="testarCompartimento(${item.dia_semana}, ${item.turno})" 
            title="Testar LED e Buzzer no Arduino"
            aria-label="Testar no Arduino"
          >
            <i class="ph-bold ph-speaker-simple-high text-primary"></i>
          </button>
          <button 
            type="button" 
            class="btn-icon-action" 
            onclick="iniciarEdicao(${item.id})" 
            title="Editar lembrete"
            aria-label="Editar"
          >
            <i class="ph-bold ph-pencil-simple"></i>
          </button>
          <button 
            type="button" 
            class="btn-icon-action danger" 
            onclick="solicitarExclusao(${item.id})" 
            title="Excluir lembrete"
            aria-label="Excluir"
          >
            <i class="ph-bold ph-trash"></i>
          </button>
        </div>
      </td>
    `;
    tabelaCorpo.appendChild(tr);
  });
}

function filtrarTabela() {
  const termo = filtroInput.value.toLowerCase().trim();
  const filtrados = lembretes.filter(item => 
    item.nome_remedio.toLowerCase().includes(termo) ||
    DIAS_NOMES[item.dia_semana].toLowerCase().includes(termo) ||
    TURNOS_NOMES[item.turno].toLowerCase().includes(termo) ||
    item.horario.includes(termo)
  );
  atualizarTabela(filtrados);
}

// ==============================================================================
// RENDERIZAÇÃO DA MATRIZ FÍSICA 7x4
// ==============================================================================
function atualizarMatriz7x4(lista) {
  matrixBody.innerHTML = "";

  for (let turno = 0; turno < 4; turno++) {
    const tr = document.createElement("tr");

    const thTurno = document.createElement("th");
    thTurno.className = "matrix-shift-label";
    thTurno.scope = "row";
    thTurno.innerHTML = `
      <i class="ph-bold ${TURNOS_ICONES[turno]} shift-${obterNomeTurnoClass(turno)}"></i>
      ${TURNOS_NOMES[turno]}
    `;
    tr.appendChild(thTurno);

    for (let dia = 0; dia < 7; dia++) {
      const td = document.createElement("td");
      td.className = "matrix-cell";

      const remediosNoSlot = lista.filter(item => item.dia_semana === dia && item.turno === turno && item.ativo);

      if (remediosNoSlot.length > 0) {
        td.classList.add("has-alarm");
        td.title = `Compartimento [${DIAS_ABREV[dia]} - ${TURNOS_NOMES[turno]}]: Clique para testar!`;
        
        let conteudo = "";
        remediosNoSlot.forEach(r => {
          conteudo += `
            <span class="cell-pill-tag" title="${escapeHTML(r.nome_remedio)}">
              ${escapeHTML(r.nome_remedio)}
            </span>
            <span class="cell-time-tag">${r.horario}</span>
          `;
        });

        conteudo += `
          <button type="button" class="cell-btn-test" onclick="event.stopPropagation(); testarCompartimento(${dia}, ${turno});">
            <i class="ph-bold ph-speaker-simple-high"></i> Testar
          </button>
        `;

        td.innerHTML = conteudo;
        td.addEventListener("click", () => testarCompartimento(dia, turno));
      } else {
        td.innerHTML = `<span style="color: var(--border-color); font-size: 13px;">— Vazio —</span>`;
      }

      tr.appendChild(td);
    }

    matrixBody.appendChild(tr);
  }
}

function obterNomeTurnoClass(turno) {
  const classes = ["morning", "afternoon", "evening", "bedtime"];
  return classes[turno] || "morning";
}

// ==============================================================================
// UTILITÁRIOS E FEEDBACK
// ==============================================================================

function marcarDias(diasParaMarcar) {
  const checkboxes = document.querySelectorAll('input[name="diasSemana"]');
  checkboxes.forEach(cb => {
    cb.checked = diasParaMarcar.includes(parseInt(cb.value, 10));
  });
}

function mostrarToast(mensagem, tipo = "info") {
  const toast = document.createElement("div");
  toast.className = `toast toast-${tipo}`;

  let icone = "ph-info";
  if (tipo === "success") icone = "ph-check-circle";
  if (tipo === "error") icone = "ph-warning-circle";

  toast.innerHTML = `
    <i class="ph-bold ${icone}" style="font-size: 24px;"></i>
    <span>${mensagem}</span>
  `;

  toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateX(100%)";
    toast.style.transition = "all 0.3s ease";
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

function alternarAltoContraste() {
  const isHigh = document.body.classList.toggle("high-contrast");
  localStorage.setItem("caixaRemedioAltoContraste", isHigh ? "true" : "false");
  atualizarIconeTema(isHigh);
}

function verificarTemaSalvo() {
  const salvo = localStorage.getItem("caixaRemedioAltoContraste") === "true";
  if (salvo) {
    document.body.classList.add("high-contrast");
  }
  atualizarIconeTema(salvo);
}

function atualizarIconeTema(isHigh) {
  const icon = document.getElementById("themeIcon");
  const text = document.getElementById("themeText");
  if (isHigh) {
    icon.className = "ph-bold ph-sun";
    text.textContent = "Modo Padrão";
  } else {
    icon.className = "ph-bold ph-moon";
    text.textContent = "Alto Contraste";
  }
}

function escapeHTML(str) {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
