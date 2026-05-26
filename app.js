// Polly e Thi finance - Inteligência Financeira e Simulação de Cenários

// HELPER: formato YYYY-MM do mês atual
function getYearMonth(date) {
    const d = date || new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// ESTADO GLOBAL DA APLICAÇÃO
const state = {
    currentUser: null,
    profile: {
        salary: 0,
        otherIncome: 0,
        rent: 0,
        consortium: 0,
        card: 0,
        bills: 0,
        market: 0
    },
    transactions: [],       // Transações do mês ativo
    monthSummaries: {},     // Resumos de todos os meses { "2026-05": { totalIncome, totalExpenses, ... } }
    activeMonth: getYearMonth(), // Mês selecionado atualmente
    goals: [],
    emergencyReserve: 0,
    activeTab: 'dashboard',
    sandbox: {
        salaryIncrease: 0,
        rentCut: 0,
        extraSavings: 0
    },
    currentProjectionMonths: 3
};

// Referências globais dos Gráficos do Chart.js
let patrimonyChartInstance = null;
let categoryChartInstance = null;
let necessityChartInstance = null;

// INICIALIZAÇÃO DO SISTEMA
document.addEventListener('DOMContentLoaded', () => {
    // Configurar escuta do input de descrição de transações para auto-categorização
    document.getElementById('trans-desc').addEventListener('input', autoCategorizeInput);
    
    // Verificar sessão ativa de login do usuário
    checkAuthSession();
    
    // Registrar PWA Service Worker para suportar instalação móvel
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('service-worker.js')
            .then(reg => {
                console.log('PWA Service Worker registrado com sucesso:', reg.scope);
                checkNotificationSubscription(reg);
            })
            .catch(err => console.error('Erro ao registrar PWA Service Worker:', err));
    }
});

// GESTÃO DE NOTIFICAÇÕES PUSH
async function checkNotificationSubscription(reg) {
    const subscription = await reg.pushManager.getSubscription();
    const btn = document.getElementById('enable-notifications-btn');
    if (subscription) {
        btn.textContent = 'Alertas Ativos';
        btn.classList.add('enabled');
    }
}

async function requestNotificationPermission() {
    if (!('Notification' in window)) {
        alert('Este navegador não suporta notificações desktop.');
        return;
    }

    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
        subscribeUserToPush();
    } else {
        alert('Permissão de notificação negada. Você não receberá alertas de vencimento.');
    }
}

async function subscribeUserToPush() {
    try {
        const reg = await navigator.serviceWorker.ready;
        
        // Buscar chave pública do servidor
        const response = await fetch('/api/notifications/vapid-public-key');
        const { publicKey } = await response.json();
        
        const subscription = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(publicKey)
        });
        
        // Salvar no servidor
        await fetch('/api/notifications/subscribe', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'x-user-id': state.currentUser ? state.currentUser.id : null
            },
            body: JSON.stringify({ subscription })
        });
        
        const btn = document.getElementById('enable-notifications-btn');
        btn.textContent = 'Alertas Ativos';
        btn.classList.add('enabled');
        alert('Notificações ativadas com sucesso!');
        
    } catch (e) {
        console.error('Erro ao assinar notificações:', e);
    }
}

function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}


// CARREGAR DADOS DO PERFIL NO FORMULÁRIO DE AJUSTES
function loadProfileIntoForm() {
    document.getElementById('prof-salary').value = state.profile.salary;
    document.getElementById('prof-other-income').value = state.profile.otherIncome;
    document.getElementById('prof-rent').value = state.profile.rent;
    document.getElementById('prof-consortium').value = state.profile.consortium;
    document.getElementById('prof-card').value = state.profile.card;
    document.getElementById('prof-bills').value = state.profile.bills;
    document.getElementById('prof-market').value = state.profile.market;
    document.getElementById('update-reserve-input').value = state.emergencyReserve;
}

// NAVEGAÇÃO ENTRE ABAS (SPA)
function switchTab(tabName) {
    state.activeTab = tabName;
    
    // Sincronizar o Select Mobile se existir
    const mobileSelect = document.getElementById('mobile-tab-select');
    if (mobileSelect) mobileSelect.value = tabName;
    
    // Atualizar botões da sidebar (desktop)
    document.querySelectorAll('.nav-item').forEach(btn => btn.classList.remove('active'));
    const activeBtn = document.getElementById(`tab-${tabName}`);
    if (activeBtn) activeBtn.classList.add('active');
    
    // Atualizar painéis visíveis
    document.querySelectorAll('.tab-panel').forEach(panel => panel.classList.remove('active'));
    document.getElementById(`panel-${tabName}`).classList.add('active');
    
    // Customizar títulos e subtítulos dependendo da aba
    const titleEl = document.getElementById('page-title');
    const subtitleEl = document.getElementById('page-subtitle');
    
    if (tabName === 'dashboard') {
        titleEl.textContent = 'Dashboard Financeiro';
        subtitleEl.textContent = 'Sua saúde financeira analisada em tempo real por Inteligência Artificial.';
        // Recriar gráficos para evitar problemas de redimensionamento
        setTimeout(renderAllCharts, 100);
    } else if (tabName === 'transacoes') {
        titleEl.textContent = 'Controle de Lançamentos';
        subtitleEl.textContent = 'Registre suas transações diárias e configure seu perfil financeiro estável.';
    } else if (tabName === 'metas') {
        titleEl.textContent = 'Metas & Reserva de Segurança';
        subtitleEl.textContent = 'Gerencie sua reserva de emergência recomendada e acompanhe seus objetivos.';
    } else if (tabName === 'simulador') {
        titleEl.textContent = 'Simulador & Inteligência Artificial';
        subtitleEl.textContent = 'Simule cenários hipotéticos e tire dúvidas financeiras com o consultor Finances.AI.';
        // Forçar execução do simulador ao abrir a aba
        runSandboxSimulation();
    }
}

// FORMATADOR DE MOEDA REAL (R$)
function formatCurrency(val) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
}

// RECALCULAR TODO O ESTADO FINANCEIRO DA APLICAÇÃO
function recalculateAll() {
    // 1. Receitas
    const fixedSalary = parseFloat(state.profile.salary) || 0;
    const otherIncome = parseFloat(state.profile.otherIncome) || 0;
    
    // Somar também receitas extras dinâmicas do mês
    const extraIncomesSum = state.transactions
        .filter(t => t.type === 'income-extra')
        .reduce((acc, t) => acc + t.value, 0);
        
    const totalIncome = fixedSalary + otherIncome + extraIncomesSum;
    
    // 2. Despesas Fixas
    const rent = parseFloat(state.profile.rent) || 0;
    const consortium = parseFloat(state.profile.consortium) || 0;
    const card = parseFloat(state.profile.card) || 0;
    const bills = parseFloat(state.profile.bills) || 0;
    const market = parseFloat(state.profile.market) || 0;
    
    // Somar despesas fixas lançadas manualmente na tabela
    const dynamicFixedExpensesSum = state.transactions
        .filter(t => t.type === 'expense-fixed')
        .reduce((acc, t) => acc + t.value, 0);
        
    const totalFixedExpenses = rent + consortium + card + bills + market + dynamicFixedExpensesSum;
    
    // 3. Despesas Variáveis dinâmicas do mês
    const totalVariableExpenses = state.transactions
        .filter(t => t.type === 'expense-variable')
        .reduce((acc, t) => acc + t.value, 0);
        
    // 4. Sobra Média Estimada e Caixa Mensal
    const totalExpenses = totalFixedExpenses + totalVariableExpenses;
    const balance = totalIncome - totalExpenses;
    
    // 5. Atualizar os Cards na Tela
    document.getElementById('card-income-value').textContent = formatCurrency(totalIncome);
    document.getElementById('card-income-fixed').textContent = `Fixo: ${formatCurrency(fixedSalary)}`;
    document.getElementById('card-income-variable').textContent = `Outros/Extra: ${formatCurrency(otherIncome + extraIncomesSum)}`;
    
    document.getElementById('card-expenses-fixed-value').textContent = formatCurrency(totalFixedExpenses);
    
    // Razão das despesas fixas em relação à renda
    const fixedRatio = totalIncome > 0 ? (totalFixedExpenses / totalIncome) * 100 : 0;
    document.getElementById('fixed-progress').style.width = `${Math.min(100, fixedRatio)}%`;
    document.getElementById('fixed-ratio-text').textContent = `${fixedRatio.toFixed(0)}% da renda`;
    // Alerta de excesso de gastos fixos
    if (fixedRatio > 80) {
        document.getElementById('fixed-progress').style.backgroundColor = 'var(--accent-red)';
    } else if (fixedRatio > 60) {
        document.getElementById('fixed-progress').style.backgroundColor = 'var(--accent-orange)';
    } else {
        document.getElementById('fixed-progress').style.backgroundColor = 'var(--accent-red)'; // Mantém o vermelho padrão da despesa fixa
    }
    
    document.getElementById('card-expenses-var-value').textContent = formatCurrency(totalVariableExpenses);
    // Calcular média diária das despesas variáveis (base de 30 dias)
    const dailyAverage = totalVariableExpenses / 30;
    document.getElementById('var-average-badge').textContent = `Média diária: ${formatCurrency(dailyAverage)}`;
    
    // Sobra Mensal
    const balanceEl = document.getElementById('card-balance-value');
    balanceEl.textContent = formatCurrency(balance);
    if (balance < 0) {
        balanceEl.style.color = 'var(--accent-red)';
    } else {
        balanceEl.style.color = 'white';
    }
    
    // Taxa de economia
    const savingsRate = totalIncome > 0 ? (balance / totalIncome) * 100 : 0;
    document.getElementById('savings-rate-text').textContent = balance > 0 
        ? `Economia: ${savingsRate.toFixed(1)}% do orçamento`
        : `Déficit financeiro estimado`;
        
    // 6. Indicadores Rápidos
    const compromisedRatio = totalIncome > 0 ? (totalExpenses / totalIncome) * 100 : 0;
    document.getElementById('compromised-percentage').textContent = `${compromisedRatio.toFixed(0)}%`;
    const compBar = document.getElementById('compromised-bar');
    compBar.style.width = `${Math.min(100, compromisedRatio)}%`;
    if (compromisedRatio > 80) {
        compBar.className = 'ind-bar red-fill';
        document.getElementById('compromised-percentage').style.color = 'var(--accent-red)';
    } else if (compromisedRatio > 60) {
        compBar.className = 'ind-bar orange-fill';
        document.getElementById('compromised-percentage').style.color = 'var(--accent-orange)';
    } else {
        compBar.className = 'ind-bar green-fill';
        document.getElementById('compromised-percentage').style.color = 'var(--accent-green)';
    }
    
    // Reserva de emergência: quantos meses de gastos fixos ela cobre
    const safeMonthlyCost = totalFixedExpenses > 0 ? totalFixedExpenses : 1000;
    const emergencyMonths = state.emergencyReserve / safeMonthlyCost;
    document.getElementById('emergency-months-count').textContent = emergencyMonths.toFixed(1);
    
    // Barra de progresso da reserva (meta ideal = 6 meses de custos fixos fundamentais)
    const reserveTarget = safeMonthlyCost * 6;
    document.getElementById('reserve-monthly-cost').textContent = formatCurrency(safeMonthlyCost);
    document.getElementById('reserve-target-value').textContent = formatCurrency(reserveTarget);
    document.getElementById('reserve-current-value').textContent = formatCurrency(state.emergencyReserve);
    
    const reserveProgressRatio = reserveTarget > 0 ? (state.emergencyReserve / reserveTarget) * 100 : 0;
    document.getElementById('emergency-percentage').textContent = `${Math.min(100, reserveProgressRatio).toFixed(0)}%`;
    document.getElementById('emergency-bar').style.width = `${Math.min(100, reserveProgressRatio)}%`;
    document.getElementById('emergency-months-status').textContent = emergencyMonths >= 6 
        ? 'Meta segura atingida!' 
        : `Cobre ${emergencyMonths.toFixed(1)} meses (Meta: 6M)`;
        
    // Capacidade de Investimento (Percentual de sobra após despesas fixas)
    // Mostra quanto da renda livre (Renda Total - Gastos Fixos) está sendo poupada
    const freeIncome = totalIncome - totalFixedExpenses;
    const investmentCapacity = freeIncome > 0 ? (balance / freeIncome) * 100 : 0;
    document.getElementById('investment-percentage').textContent = balance > 0 ? `${investmentCapacity.toFixed(0)}%` : '0%';
    document.getElementById('investment-bar').style.width = `${Math.max(0, Math.min(100, investmentCapacity))}%`;
    
    // 7. Saúde Financeira (Health Score)
    const healthScore = calculateHealthScore(savingsRate, compromisedRatio, emergencyMonths);
    updateHealthRing(healthScore);
    
    // 8. Atualizar Histórico de Transações na Tabela
    renderTransactionsTable();
    
    // 9. Atualizar lista de Metas Financeiras
    renderGoalsList();
    
    // 10. Atualizar Gráficos
    renderAllCharts();
    
    // 11. Atualizar Insights da IA
    updateAIProactiveAdvice(totalIncome, totalFixedExpenses, totalVariableExpenses, balance, emergencyMonths, compromisedRatio);
}

// ALGORITMO DE CÁLCULO DA SAÚDE FINANCEIRA
function calculateHealthScore(savingsRate, compromisedRatio, emergencyMonths) {
    // 40% do Score: Taxa de Economia (Ideal >= 20%)
    let savingsScore = 0;
    if (savingsRate > 0) {
        savingsScore = Math.min(100, (savingsRate / 20) * 100);
    }
    
    // 30% do Score: Comprometimento da Renda (Ideal <= 60%. Crítico > 80%)
    let commitmentScore = 0;
    if (compromisedRatio <= 60) {
        commitmentScore = 100;
    } else if (compromisedRatio >= 100) {
        commitmentScore = 0;
    } else {
        // Interpolação linear entre 60% e 100% de gastos
        commitmentScore = 100 - ((compromisedRatio - 60) / 40) * 100;
    }
    
    // 30% do Score: Reserva de Emergência (Ideal >= 6 meses)
    const reserveScore = Math.min(100, (emergencyMonths / 6) * 100);
    
    // Média ponderada
    const finalScore = (savingsScore * 0.4) + (commitmentScore * 0.3) + (reserveScore * 0.3);
    return Math.round(finalScore);
}

// ATUALIZAR O ANEL DE SAÚDE FINANCEIRA NO CABEÇALHO
function updateHealthRing(score) {
    const ring = document.getElementById('health-ring');
    const pct = document.getElementById('health-percentage');
    const txt = document.getElementById('health-text');
    
    pct.textContent = `${score}%`;
    
    let color = 'var(--accent-green)';
    let statusText = 'Excelente';
    
    if (score < 40) {
        color = 'var(--accent-red)';
        statusText = 'Crítica';
        txt.style.color = 'var(--accent-red)';
    } else if (score < 75) {
        color = 'var(--accent-orange)';
        statusText = 'Alerta';
        txt.style.color = 'var(--accent-orange)';
    } else {
        color = 'var(--accent-green)';
        statusText = 'Saudável';
        txt.style.color = 'var(--accent-green)';
    }
    
    txt.textContent = statusText;
    
    // Conic gradient circular animado
    ring.style.background = `conic-gradient(${color} 0% ${score}%, rgba(255, 255, 255, 0.05) ${score}% 100%)`;
    
    // Atualizar no modal de saúde financeira detalhado
    document.getElementById('modal-health-score').textContent = `${score}%`;
    document.getElementById('modal-health-score').style.color = color;
    document.getElementById('modal-health-status').textContent = statusText;
    document.getElementById('modal-health-status').style.color = color;
}

// AUTO-CATEGORIZAÇÃO INTELIGENTE POR TEXTO
const categoryKeywords = {
    'Alimentação': ['mercado', 'carrefour', 'pao de acucar', 'pão de açúcar', 'feira', 'restaurante', 'ifood', 'burger', 'mcdonalds', 'pizza', 'padaria', 'almoço', 'jantar', 'cafe', 'lanche', 'supermercado', 'extra'],
    'Transporte': ['uber', '99', 'taxi', 'táxi', 'gasolina', 'combustivel', 'combustível', 'metro', 'metrô', 'onibus', 'ônibus', 'pedagio', 'pedágio', 'estacionamento', 'ipva', 'mecanico', 'oficina'],
    'Lazer': ['netflix', 'spotify', 'cinema', 'show', 'cerveja', 'bar', 'balada', 'viagem', 'hospedagem', 'ingresso', 'teatro', 'jogos', 'games', 'playstation', 'steam', 'livro'],
    'Saúde': ['farmacia', 'droga', 'drogasil', 'drogaria', 'medico', 'médico', 'dentista', 'consulta', 'exame', 'remedio', 'remédio', 'hospital', 'saude', 'unimed'],
    'Moradia': ['aluguel', 'condominio', 'condomínio', 'luz', 'enel', 'agua', 'sabesp', 'internet', 'celular', 'claro', 'vivo', 'gás', 'gas', 'iptu', 'faxina']
};

function autoCategorizeInput() {
    const desc = document.getElementById('trans-desc').value.toLowerCase().trim();
    if (!desc) return;
    
    let detectedCategory = 'Outros';
    let isEssential = false;
    
    // Procurar por palavras-chave em cada categoria
    for (const [category, keywords] of Object.entries(categoryKeywords)) {
        const found = keywords.some(keyword => desc.includes(keyword));
        if (found) {
            detectedCategory = category;
            break;
        }
    }
    
    // Lógica inteligente para definir se o gasto é essencial
    if (detectedCategory === 'Moradia' || detectedCategory === 'Saúde') {
        isEssential = true;
    } else if (detectedCategory === 'Alimentação') {
        // Alimentação fora (ifood, burger, restaurante) normalmente não é essencial de sobrevivência pura
        if (desc.includes('mercado') || desc.includes('supermercado') || desc.includes('feira') || desc.includes('carrefour') || desc.includes('açúcar')) {
            isEssential = true;
        } else {
            isEssential = false;
        }
    } else if (detectedCategory === 'Transporte') {
        // Gasolina ou mecânico costumam ser essenciais para quem trabalha/desloca
        if (desc.includes('gasolina') || desc.includes('mecanico') || desc.includes('oficina') || desc.includes('combustivel')) {
            isEssential = true;
        } else {
            isEssential = false;
        }
    }
    
    // Aplicar a detecção nos inputs do formulário de transações
    document.getElementById('trans-category').value = detectedCategory;
    document.getElementById('trans-essential').checked = isEssential;
}

// TOGGLE ENTRE OPÇÕES DE CATEGORIA (ESCONDER PARA RECEITA)
function toggleCategoryOptions() {
    const type = document.getElementById('trans-type').value;
    const catGroup = document.getElementById('category-group');
    const essentialGroup = document.getElementById('trans-essential').parentElement;
    const installGroup = document.getElementById('installment-group');
    
    if (type === 'income-extra') {
        catGroup.classList.add('hidden');
        essentialGroup.classList.add('hidden');
        installGroup.classList.add('hidden');
        document.getElementById('installment-months-group').classList.add('hidden');
        document.getElementById('trans-installment').checked = false;
    } else {
        catGroup.classList.remove('hidden');
        essentialGroup.classList.remove('hidden');
        installGroup.classList.remove('hidden');
        if (type === 'expense-fixed') {
            installGroup.classList.add('hidden'); // Despesa fixa recorrente não se parcela da mesma forma
            document.getElementById('installment-months-group').classList.add('hidden');
            document.getElementById('trans-installment').checked = false;
        }
    }
}

// CONTROLES DE PARCELAMENTO NO FORMULÁRIO
function toggleInstallmentMonths() {
    const isChecked = document.getElementById('trans-installment').checked;
    const monthsGroup = document.getElementById('installment-months-group');
    
    if (isChecked) {
        monthsGroup.classList.remove('hidden');
    } else {
        monthsGroup.classList.add('hidden');
    }
}

// ==================== NAVEGAÇÃO DE MESES ====================

function formatMonthLabel(yearMonth) {
    const [y, m] = yearMonth.split('-');
    const months = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
    return `${months[parseInt(m) - 1]} ${y}`;
}

function navigateMonth(direction) {
    // direction: -1 (anterior) ou +1 (próximo)
    const [y, m] = state.activeMonth.split('-').map(Number);
    const d = new Date(y, m - 1 + direction, 1);
    const newMonth = getYearMonth(d);
    // Não permitir navegar para além do mês atual
    if (newMonth > getYearMonth()) return;
    state.activeMonth = newMonth;
    loadActiveMonthTransactions();
}

async function loadActiveMonthTransactions() {
    if (!state.currentUser) return;
    updateMonthNavigator();

    try {
        const res = await fetch(`/api/months/${state.activeMonth}`, {
            headers: { 'Content-Type': 'application/json', 'x-user-id': state.currentUser.id }
        });
        const data = await res.json();
        if (data.error) { console.error(data.error); return; }
        state.transactions = data.transactions || [];
        recalculateAll();
    } catch(e) {
        console.error('Erro ao carregar mês:', e);
    }
}

function updateMonthNavigator() {
    const el = document.getElementById('active-month-label');
    if (el) el.textContent = formatMonthLabel(state.activeMonth);

    const nextBtn = document.getElementById('btn-next-month');
    if (nextBtn) {
        nextBtn.disabled = state.activeMonth >= getYearMonth();
        nextBtn.style.opacity = state.activeMonth >= getYearMonth() ? '0.3' : '1';
    }
    renderHistoryTable();
}

function renderHistoryTable() {
    const tbody = document.getElementById('history-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    const allMonths = Object.keys(state.monthSummaries).sort().reverse();
    if (allMonths.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:2rem;">Nenhum histórico encontrado ainda.</td></tr>`;
        return;
    }

    allMonths.forEach(ym => {
        const s = state.monthSummaries[ym];
        const totalInc = (s.totalIncome || 0) + (parseFloat(state.profile.salary) || 0) + (parseFloat(state.profile.otherIncome) || 0);
        const totalExp = (s.totalExpenses || 0) +
            (parseFloat(state.profile.rent) || 0) +
            (parseFloat(state.profile.consortium) || 0) +
            (parseFloat(state.profile.card) || 0) +
            (parseFloat(state.profile.bills) || 0) +
            (parseFloat(state.profile.market) || 0);
        const bal = totalInc - totalExp;
        const statusEmoji = bal >= 0 ? '🟢' : '🔴';
        const isActive = ym === state.activeMonth ? 'style="background:rgba(99,102,241,0.12);"' : '';

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td ${isActive}><strong>${formatMonthLabel(ym)}</strong>${ym === state.activeMonth ? ' <span class="badge green" style="font-size:0.6rem;">Ativo</span>' : ''}</td>
            <td>${formatCurrency(totalInc)}</td>
            <td style="color:var(--accent-red);">${formatCurrency(totalExp)}</td>
            <td style="color:${bal >= 0 ? 'var(--accent-green)' : 'var(--accent-red)'};"><strong>${formatCurrency(bal)}</strong></td>
            <td>${statusEmoji} <button class="filter-btn" style="padding:0.2rem 0.6rem;font-size:0.7rem;" onclick="selectMonth('${ym}')">Ver</button></td>
        `;
        tbody.appendChild(tr);
    });
}

function selectMonth(ym) {
    state.activeMonth = ym;
    loadActiveMonthTransactions();
    switchTab('transacoes');
}

// FILTRAGEM E RENDERIZAÇÃO DA TABELA DE TRANSAÇÕES
let currentFilter = 'all';
function filterTransactions(filter) {
    currentFilter = filter;
    document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
    event.target.classList.add('active');
    renderTransactionsTable();
}

function renderTransactionsTable() {
    const tbody = document.getElementById('transactions-tbody');
    tbody.innerHTML = '';
    
    let filteredList = state.transactions;
    if (currentFilter === 'expense') {
        filteredList = state.transactions.filter(t => t.type.startsWith('expense'));
    } else if (currentFilter === 'income') {
        filteredList = state.transactions.filter(t => t.type.startsWith('income'));
    }
    
    // Inverter para mostrar as mais recentes primeiro
    const displayList = [...filteredList].reverse();
    
    if (displayList.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding: 2rem;">Nenhum lançamento encontrado.</td></tr>`;
        return;
    }
    
    displayList.forEach(t => {
        const tr = document.createElement('tr');
        if (t.pending) tr.classList.add('row-pending');
        
        let typeBadge = '';
        let typeClass = '';
        if (t.type === 'expense-variable') {
            typeBadge = 'Variável';
            typeClass = 'badge orange';
        } else if (t.type === 'expense-fixed') {
            typeBadge = 'Fixa';
            typeClass = 'badge red';
        } else {
            typeBadge = 'Rec. Extra';
            typeClass = 'badge green';
        }
        
        const isEssentialText = t.type.startsWith('expense') 
            ? (t.essential ? '<span style="color: var(--accent-green);">&#10004; Sim</span>' : '<span style="color: var(--text-muted);">&#10006; Não</span>')
            : '-';
            
        const isExpense = t.type.startsWith('expense');
        const sign = isExpense ? '-' : '+';
        const valClass = isExpense ? 'val-txt expense' : 'val-txt income';
        
        const dateDisplay = t.dueDate ? `<br><small style="color:var(--text-muted)">Venc: ${t.dueDate.split('-').reverse().join('/')}</small>` : '';
        const pendingIcon = t.pending ? '<span title="Pendente" style="margin-right:5px; font-size: 0.8rem;">⏳</span>' : '';

        tr.innerHTML = `
            <td>${pendingIcon}<strong>${t.desc}</strong>${dateDisplay}</td>
            <td>${isExpense ? t.category : 'Receita'}</td>
            <td><span class="${typeClass}">${typeBadge}</span></td>
            <td>${isEssentialText}</td>
            <td class="${valClass}">${sign} ${formatCurrency(t.value)}</td>
            <td>
                <button class="delete-btn" onclick="deleteTransaction(${t.id})" title="Excluir Transação">&times;</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function toggleInstallmentMonths() {
    const isInstallment = document.getElementById('trans-installment').checked;
    const group = document.getElementById('installment-months-group');
    if (isInstallment) {
        group.classList.remove('hidden');
        document.getElementById('trans-recurring').checked = false; // Desmarcar o outro
        document.getElementById('recurring-months-group').classList.add('hidden');
    } else {
        group.classList.add('hidden');
    }
}

function toggleRecurringMonths() {
    const isRecurring = document.getElementById('trans-recurring').checked;
    const group = document.getElementById('recurring-months-group');
    if (isRecurring) {
        group.classList.remove('hidden');
        document.getElementById('trans-installment').checked = false; // Desmarcar o outro
        document.getElementById('installment-months-group').classList.add('hidden');
    } else {
        group.classList.add('hidden');
    }
}

// ADICIONAR NOVA TRANSAÇÃO
async function handleTransactionSubmit(e) {
    e.preventDefault();

    const desc = document.getElementById('trans-desc').value.trim();
    const value = parseFloat(document.getElementById('trans-value').value);
    const type = document.getElementById('trans-type').value;
    const category = document.getElementById('trans-category').value;
    const essential = document.getElementById('trans-essential').checked;
    const isInstallment = document.getElementById('trans-installment').checked;
    const isRecurring = document.getElementById('trans-recurring').checked;
    const dueDate = document.getElementById('trans-due-date').value;
    const pending = document.getElementById('trans-pending').checked;

    if (!desc || isNaN(value) || value <= 0) return;

    const today = new Date().toISOString().split('T')[0];

    // LÓGICA PARA PARCELAMENTO OU RECORRÊNCIA
    if ((isInstallment && type === 'expense-variable') || isRecurring) {
        const numMonths = isInstallment 
            ? (parseInt(document.getElementById('trans-install-months').value) || 2)
            : (parseInt(document.getElementById('trans-recurring-months').value) || 2);
            
        const monthlyValue = isInstallment ? (value / numMonths) : value;

        for (let i = 1; i <= numMonths; i++) {
            const dateOffset = new Date();
            dateOffset.setMonth(dateOffset.getMonth() + (i - 1));
            const transactionDate = dateOffset.toISOString().split('T')[0];
            const targetMonth = getYearMonth(dateOffset);

            // Calcular data de vencimento
            let instDueDate = null;
            if (dueDate) {
                const d = new Date(dueDate);
                d.setUTCMonth(d.getUTCMonth() + (i - 1));
                instDueDate = d.toISOString().split('T')[0];
            }

            const tx = {
                id: Date.now() + i,
                desc: isRecurring ? desc : `${desc} (${i}/${numMonths})`,
                value: monthlyValue,
                type: type,
                category: type === 'income-extra' ? 'Outros' : category,
                essential: type === 'income-extra' ? false : essential,
                date: transactionDate,
                dueDate: instDueDate,
                pending
            };

            await addTransactionToMonth(targetMonth, tx);

            if (targetMonth === state.activeMonth) {
                state.transactions.push(tx);
            }
        }
        
        const msg = isRecurring 
            ? `Agendei o lançamento <strong>${desc}</strong> para os próximos <strong>${numMonths} meses</strong>!`
            : `Registrei a compra parcelada <strong>${desc}</strong> em <strong>${numMonths}x de ${formatCurrency(monthlyValue)}</strong>!`;
            
        addAIMessage('IA', msg);
    } else {
        const tx = {
            id: Date.now(),
            desc,
            value,
            type,
            category: type === 'income-extra' ? 'Outros' : category,
            essential: type === 'income-extra' ? false : essential,
            date: today,
            dueDate: dueDate || null,
            pending: pending || false
        };

        await addTransactionToMonth(state.activeMonth, tx);
        state.transactions.push(tx);
    }

    // Atualizar resumo local do mês ativo
    syncMonthSummary(state.activeMonth);

    document.getElementById('transaction-form').reset();
    document.getElementById('installment-months-group').classList.add('hidden');
    toggleCategoryOptions();
    recalculateAll();

    const submitBtn = e.target.querySelector('button[type="submit"]');
    const originalText = submitBtn.textContent;
    submitBtn.textContent = 'Lançamento Efetuado!';
    submitBtn.style.backgroundColor = '#059669';
    setTimeout(() => {
        submitBtn.textContent = originalText;
        submitBtn.style.backgroundColor = '';
    }, 1500);
}

async function addTransactionToMonth(yearMonth, tx) {
    if (!state.currentUser) return;
    try {
        await fetch(`/api/months/${yearMonth}/transactions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-user-id': state.currentUser.id },
            body: JSON.stringify(tx)
        });
    } catch(e) {
        console.error('Erro ao salvar transação:', e);
    }
}

// Atualizar o resumo local do mês no monthSummaries
function syncMonthSummary(yearMonth) {
    const txs = yearMonth === state.activeMonth ? state.transactions : [];
    const income = txs.filter(t => t.type === 'income-extra').reduce((s, t) => s + t.value, 0);
    const expenses = txs.filter(t => t.type.startsWith('expense')).reduce((s, t) => s + t.value, 0);
    state.monthSummaries[yearMonth] = {
        ...(state.monthSummaries[yearMonth] || {}),
        transactionCount: txs.length,
        totalIncome: income,
        totalExpenses: expenses,
        balance: income - expenses
    };
    renderHistoryTable();
}

// EXCLUIR TRANSAÇÃO
async function deleteTransaction(id) {
    if (!state.currentUser) return;
    try {
        await fetch(`/api/months/${state.activeMonth}/transactions/${id}`, {
            method: 'DELETE',
            headers: { 'x-user-id': state.currentUser.id }
        });
        state.transactions = state.transactions.filter(t => t.id !== id);
        syncMonthSummary(state.activeMonth);
        recalculateAll();
    } catch(e) {
        console.error('Erro ao excluir transação:', e);
    }
}

// ATUALIZAR PERFIL BASE DE RECEITAS E DESPESAS FIXAS
async function handleProfileSubmit(e) {
    e.preventDefault();

    state.profile.salary = parseFloat(document.getElementById('prof-salary').value) || 0;
    state.profile.otherIncome = parseFloat(document.getElementById('prof-other-income').value) || 0;
    state.profile.rent = parseFloat(document.getElementById('prof-rent').value) || 0;
    state.profile.consortium = parseFloat(document.getElementById('prof-consortium').value) || 0;
    state.profile.card = parseFloat(document.getElementById('prof-card').value) || 0;
    state.profile.bills = parseFloat(document.getElementById('prof-bills').value) || 0;
    state.profile.market = parseFloat(document.getElementById('prof-market').value) || 0;

    recalculateAll();
    await saveUserFinancials();

    const submitBtn = e.target.querySelector('button[type="submit"]');
    const originalText = submitBtn.textContent;
    submitBtn.textContent = 'Perfil Atualizado!';
    submitBtn.style.background = 'var(--accent-green)';
    setTimeout(() => {
        submitBtn.textContent = originalText;
        submitBtn.style.background = '';
    }, 1500);
}

// METAS E RESERVA DE EMERGÊNCIA
function updateEmergencyReserve() {
    const val = parseFloat(document.getElementById('update-reserve-input').value);
    if (isNaN(val) || val < 0) return;
    
    state.emergencyReserve = val;
    recalculateAll();
    saveUserFinancials();
    
    addAIMessage('IA', `Sua reserva de emergência foi atualizada para <strong>${formatCurrency(state.emergencyReserve)}</strong>. Isso cobre <strong>${(state.emergencyReserve / (document.getElementById('reserve-monthly-cost').textContent.replace(/[^\d,-]/g, '').replace(',', '.') || 1000)).toFixed(1)} meses</strong> de seus custos fixos fundamentais.`);
}

function renderGoalsList() {
    const container = document.getElementById('goals-list-container');
    container.innerHTML = '';
    
    if (state.goals.length === 0) {
        container.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 2rem;">Você ainda não criou nenhuma meta financeira.</div>`;
        return;
    }
    
    state.goals.forEach(goal => {
        const pct = goal.target > 0 ? (goal.saved / goal.target) * 100 : 0;
        const card = document.createElement('div');
        card.className = 'goal-card';
        card.innerHTML = `
            <div class="goal-title-row">
                <span class="goal-name">${goal.title}</span>
                <span class="goal-values"><span class="saved">${formatCurrency(goal.saved)}</span> / ${formatCurrency(goal.target)}</span>
            </div>
            <div class="goal-bar-wrapper">
                <div class="goal-bar-fill" style="width: ${Math.min(100, pct)}%"></div>
            </div>
            <div class="goal-footer-row">
                <span class="goal-percentage-badge">${pct.toFixed(0)}% Concluído</span>
                <button class="delete-goal-btn" onclick="deleteGoal(${goal.id})">Excluir Meta</button>
            </div>
        `;
        container.appendChild(card);
    });
}

function handleGoalSubmit(e) {
    e.preventDefault();
    
    const title = document.getElementById('goal-title').value.trim();
    const target = parseFloat(document.getElementById('goal-target').value);
    const saved = parseFloat(document.getElementById('goal-saved').value) || 0;
    
    if (!title || isNaN(target) || target <= 0) return;
    
    state.goals.push({
        id: Date.now(),
        title: title,
        target: target,
        saved: Math.min(target, saved)
    });
    
    closeGoalModal();
    document.getElementById('goal-form').reset();
    recalculateAll();
    saveUserFinancials();
}

// EXCLUIR META
function deleteGoal(id) {
    state.goals = state.goals.filter(g => g.id !== id);
    recalculateAll();
    saveUserFinancials();
}

// CONTROLADORES DE MODAL
function openNewGoalModal() {
    document.getElementById('goal-modal').style.display = 'flex';
}

function closeGoalModal() {
    document.getElementById('goal-modal').style.display = 'none';
}

function openHealthDetailsModal() {
    // Atualizar explicações das regras dinamicamente com base nas contas atuais
    const fixedSalary = parseFloat(state.profile.salary) || 0;
    const otherIncome = parseFloat(state.profile.otherIncome) || 0;
    const rent = parseFloat(state.profile.rent) || 0;
    const consortium = parseFloat(state.profile.consortium) || 0;
    const card = parseFloat(state.profile.card) || 0;
    const bills = parseFloat(state.profile.bills) || 0;
    const market = parseFloat(state.profile.market) || 0;
    
    const dynamicFixedExpensesSum = state.transactions
        .filter(t => t.type === 'expense-fixed')
        .reduce((acc, t) => acc + t.value, 0);
        
    const extraIncomesSum = state.transactions
        .filter(t => t.type === 'income-extra')
        .reduce((acc, t) => acc + t.value, 0);
        
    const totalIncome = fixedSalary + otherIncome + extraIncomesSum;
    const totalFixedExpenses = rent + consortium + card + bills + market + dynamicFixedExpensesSum;
    const totalVariableExpenses = state.transactions
        .filter(t => t.type === 'expense-variable')
        .reduce((acc, t) => acc + t.value, 0);
        
    const totalExpenses = totalFixedExpenses + totalVariableExpenses;
    const balance = totalIncome - totalExpenses;
    const savingsRate = totalIncome > 0 ? (balance / totalIncome) * 100 : 0;
    const compromisedRatio = totalIncome > 0 ? (totalFixedExpenses / totalIncome) * 100 : 0;
    const emergencyMonths = state.emergencyReserve / (totalFixedExpenses > 0 ? totalFixedExpenses : 1000);
    
    // Regra 1: Regra dos 20% livres
    const ruleSurplus = document.getElementById('rule-surplus');
    const ruleSurplusDesc = document.getElementById('rule-surplus-desc');
    if (savingsRate >= 20) {
        ruleSurplus.className = 'rule-item';
        ruleSurplus.querySelector('.rule-icon').innerHTML = '&#10004;';
        ruleSurplusDesc.innerHTML = `Você mantém <strong>${savingsRate.toFixed(1)}%</strong> da sua renda livre para investimentos. Fantástico, ultrapassa a barreira ideal dos 20%!`;
    } else if (savingsRate > 0) {
        ruleSurplus.className = 'rule-item violated';
        ruleSurplus.querySelector('.rule-icon').innerHTML = '&#9888;';
        ruleSurplusDesc.innerHTML = `Sua taxa de economia está em <strong>${savingsRate.toFixed(1)}%</strong>, abaixo do ideal sugerido de 20%. Tente reduzir gastos variáveis.`;
    } else {
        ruleSurplus.className = 'rule-item violated';
        ruleSurplus.querySelector('.rule-icon').innerHTML = '&#9888;';
        ruleSurplusDesc.innerHTML = `Suas contas estão no déficit mensal de <strong>${formatCurrency(balance)}</strong>. O recomendado é reestruturar suas contas imediatamente.`;
    }
    
    // Regra 2: Gastos Fixos abaixo de 80%
    const ruleCommitment = document.getElementById('rule-commitment');
    const ruleCommitmentDesc = document.getElementById('rule-commitment-desc');
    if (compromisedRatio <= 60) {
        ruleCommitment.className = 'rule-item';
        ruleCommitment.querySelector('.rule-icon').innerHTML = '&#10004;';
        ruleCommitmentDesc.innerHTML = `Excelente! Seus custos fixos ocupam apenas <strong>${compromisedRatio.toFixed(0)}%</strong> do seu orçamento, dando grande estabilidade.`;
    } else if (compromisedRatio <= 80) {
        ruleCommitment.className = 'rule-item';
        ruleCommitment.querySelector('.rule-icon').innerHTML = '&#10004;';
        ruleCommitmentDesc.innerHTML = `Gastos fixos representam <strong>${compromisedRatio.toFixed(0)}%</strong> da renda. Está sob controle, mas com margem estreita para variáveis.`;
    } else {
        ruleCommitment.className = 'rule-item violated';
        ruleCommitment.querySelector('.rule-icon').innerHTML = '&#9888;';
        ruleCommitmentDesc.innerHTML = `Crítico! Gastos fixos engolem <strong>${compromisedRatio.toFixed(0)}%</strong> da renda mensal. Você está muito exposto a imprevistos financeiros.`;
    }
    
    // Regra 3: Reserva de emergência de 6 meses
    const ruleReserve = document.getElementById('rule-reserve');
    const ruleReserveDesc = document.getElementById('rule-reserve-desc');
    if (emergencyMonths >= 6) {
        ruleReserve.className = 'rule-item';
        ruleReserve.querySelector('.rule-icon').innerHTML = '&#10004;';
        ruleReserveDesc.innerHTML = `Sua reserva de emergência cobre <strong>${emergencyMonths.toFixed(1)} meses</strong> de despesas fundamentais. Segurança máxima estabelecida!`;
    } else {
        ruleReserve.className = 'rule-item';
        ruleReserve.querySelector('.rule-icon').innerHTML = '&#9888;';
        ruleReserveDesc.innerHTML = `Sua reserva cobre apenas <strong>${emergencyMonths.toFixed(1)} meses</strong>. É prioritário poupar até atingir a cobertura de 6 meses (${formatCurrency(totalFixedExpenses * 6)}).`;
    }
    
    document.getElementById('health-modal').style.display = 'flex';
}

function closeHealthModal() {
    document.getElementById('health-modal').style.display = 'none';
}

// DIAGNÓSTICO E INSIGHTS PROATIVOS DA IA (IMPRESSÃO EM TELA)
function updateAIProactiveAdvice(income, fixed, variable, balance, emergencyMonths, compromisedRatio) {
    const verdictEl = document.getElementById('advisor-verdict');
    const bulletsEl = document.getElementById('advisor-bullets');
    const headlineEl = document.getElementById('dynamic-ai-headline');
    
    bulletsEl.innerHTML = '';
    
    let verdict = '';
    let headline = '';
    let tips = [];
    
    // Verificar saúde geral e compor diagnóstico
    if (balance < 0) {
        verdict = `<strong>Diagnóstico Crítico:</strong> Você está gastando mais do que ganha neste mês (déficit de ${formatCurrency(Math.abs(balance))}). É essencial identificar cortes de imediato para evitar o endividamento por juros do cartão ou cheque especial.`;
        headline = `⚠️ Risco de Déficit Financeiro! Suas despesas excedem suas receitas em ${formatCurrency(Math.abs(balance))}. Reduza despesas supérfluas hoje!`;
        tips.push('<strong>Ação Imediata:</strong> Cancele ou pause assinaturas supérfluas por 30 dias para aliviar o fluxo de caixa.');
        tips.push('<strong>Análise de Risco:</strong> Seus gastos fixos comprometem uma fatia muito alta da renda estável.');
    } else if (compromisedRatio > 80) {
        verdict = `<strong>Alerta de Rigidez:</strong> Suas despesas fixas representam <strong>${compromisedRatio.toFixed(0)}%</strong> da sua renda livre. Embora no azul, você tem quase nenhuma margem de segurança para despesas variáveis inesperadas ou lazer.`;
        headline = `🔍 Atenção: Gastos fixos elevados comprometem ${compromisedRatio.toFixed(0)}% da sua renda. Evite novos parcelamentos a longo prazo.`;
        tips.push('<strong>Recomendação:</strong> Evite qualquer nova compra parcelada até reduzir seus compromissos mensais.');
        tips.push('<strong>Negociação:</strong> Tente renegociar contratos de internet/celular ou avaliar se o aluguel cabe no bolso.');
    } else if (emergencyMonths < 3) {
        verdict = `<strong>Estabilidade Vulnerável:</strong> Suas contas correntes estão saudáveis (sobra mensal de ${formatCurrency(balance)}), porém sua <strong>Reserva de Emergência cobre apenas ${emergencyMonths.toFixed(1)} meses</strong>. Você está vulnerável caso ocorra demissão ou sinistro de saúde.`;
        headline = `🛡️ Foco na Reserva: Direcione a sobra mensal de ${formatCurrency(balance)} para acumular ao menos 6 meses de segurança.`;
        tips.push(`<strong>Meta de Poupança:</strong> Direcione 80% de sua sobra mensal (${formatCurrency(balance * 0.8)}) diretamente para a poupança da reserva.`);
        tips.push(`<strong>Prazo Estimado:</strong> Mantendo este ritmo, você atingirá a segurança ideal de 6 meses em mais <strong>${((fixed * 6 - state.emergencyReserve) / (balance * 0.8 || 1)).toFixed(0)} meses</strong>.`);
    } else {
        verdict = `<strong>Excelente Saúde Financeira!</strong> Suas contas estão equilibradas, com ótima taxa de economia (${((balance/income)*100).toFixed(0)}%) e uma reserva de segurança consolidada que cobre <strong>${emergencyMonths.toFixed(1)} meses</strong> de despesas. Você está pronto para investir!`;
        headline = `🚀 Parabéns! Suas contas estão super saudáveis. Você economiza ${((balance/income)*100).toFixed(0)}% de sua renda mensal neste momento.`;
        tips.push('<strong>Oportunidade:</strong> Com a reserva acima de 6 meses, comece a alocar o excedente mensal em fundos de investimento de longo prazo.');
        tips.push('<strong>Metas:</strong> Suas metas ativas estão avançando. O excedente pode acelerar a meta de seu Notebook!');
    }
    
    // Lazer supérfluo alto
    const leisureSum = state.transactions
        .filter(t => t.category === 'Lazer')
        .reduce((acc, t) => acc + t.value, 0);
    if (leisureSum > 500) {
        tips.push(`<strong>Alerta Lazer:</strong> Gastos com lazer já somam ${formatCurrency(leisureSum)} neste mês. Considerar reduzir as saídas no próximo fim de semana.`);
    }
    
    // Inserir na interface do painel lateral
    verdictEl.innerHTML = verdict;
    tips.forEach(tip => {
        const li = document.createElement('div');
        li.className = 'insight-bullet';
        li.innerHTML = `<span class="bullet-dot">&bull;</span><div>${tip}</div>`;
        bulletsEl.appendChild(li);
    });
    
    // Atualizar cabeçalho proativo de AI
    headlineEl.innerHTML = headline;
}

// PROJEÇÕES E NAVEGAÇÃO DE PRAZOS
function updateProjectionChart(months) {
    state.currentProjectionMonths = months;
    
    // Atualizar botões visuais
    document.getElementById('proj-3m').classList.remove('active');
    document.getElementById('proj-6m').classList.remove('active');
    document.getElementById('proj-12m').classList.remove('active');
    
    document.getElementById(`proj-${months}m`).classList.add('active');
    
    renderAllCharts();
}

// INTEGRAÇÃO DOS GRÁFICOS CHART.JS
function renderAllCharts() {
    if (state.activeTab !== 'dashboard') return;
    
    // 1. DADOS DE CÁLCULO
    const fixedSalary = parseFloat(state.profile.salary) || 0;
    const otherIncome = parseFloat(state.profile.otherIncome) || 0;
    const rent = parseFloat(state.profile.rent) || 0;
    const consortium = parseFloat(state.profile.consortium) || 0;
    const card = parseFloat(state.profile.card) || 0;
    const bills = parseFloat(state.profile.bills) || 0;
    const market = parseFloat(state.profile.market) || 0;
    
    const dynamicFixedExpensesSum = state.transactions
        .filter(t => t.type === 'expense-fixed')
        .reduce((acc, t) => acc + t.value, 0);
        
    const extraIncomesSum = state.transactions
        .filter(t => t.type === 'income-extra')
        .reduce((acc, t) => acc + t.value, 0);
        
    const totalIncome = fixedSalary + otherIncome + extraIncomesSum;
    const totalFixedExpenses = rent + consortium + card + bills + market + dynamicFixedExpensesSum;
    const totalVariableExpenses = state.transactions
        .filter(t => t.type === 'expense-variable')
        .reduce((acc, t) => acc + t.value, 0);
        
    const totalExpenses = totalFixedExpenses + totalVariableExpenses;
    const balance = totalIncome - totalExpenses;
    
    // A) GRÁFICO 1: EVOLUÇÃO PATRIMONIAL E PROJEÇÃO IA (LINHAS)
    const ctxLine = document.getElementById('patrimony-chart').getContext('2d');
    
    if (patrimonyChartInstance) {
        patrimonyChartInstance.destroy();
    }
    
    const monthsCount = state.currentProjectionMonths;
    const labels = ['Atual'];
    const currentTrendData = [state.emergencyReserve];
    const optimizedTrendData = [state.emergencyReserve];
    
    let basePatrimonyCurrent = state.emergencyReserve;
    let basePatrimonyOptimized = state.emergencyReserve;
    
    // Adicionar economia acumulada nas metas
    state.goals.forEach(g => {
        basePatrimonyCurrent += g.saved;
        basePatrimonyOptimized += g.saved;
    });
    
    currentTrendData[0] = basePatrimonyCurrent;
    optimizedTrendData[0] = basePatrimonyOptimized;
    
    const today = new Date();
    const monthsNames = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
    
    for (let i = 1; i <= monthsCount; i++) {
        const futureDate = new Date(today.getFullYear(), today.getMonth() + i, 1);
        labels.push(monthsNames[futureDate.getMonth()] + ' / ' + futureDate.getFullYear().toString().substring(2));
        
        // Tendência Real (Atual): Acumula o saldo de sobra mensal calculado
        basePatrimonyCurrent += balance;
        currentTrendData.push(Math.max(0, basePatrimonyCurrent));
        
        // Tendência Otimizada por IA: Se o usuário cortar 15% de despesas variáveis e poupar com disciplina
        const cutVariableSavings = totalVariableExpenses * 0.15;
        const optimizedMonthlySurplus = balance + cutVariableSavings;
        basePatrimonyOptimized += optimizedMonthlySurplus;
        optimizedTrendData.push(Math.max(0, basePatrimonyOptimized));
    }
    
    patrimonyChartInstance = new Chart(ctxLine, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Projeção Atual',
                    data: currentTrendData,
                    borderColor: balance >= 0 ? '#6366f1' : '#ef4444',
                    backgroundColor: 'rgba(99, 102, 241, 0.04)',
                    borderWidth: 3,
                    tension: 0.3,
                    fill: true
                },
                {
                    label: 'Cenário Recomendado IA (Corte 15% Var)',
                    data: optimizedTrendData,
                    borderColor: '#10b981',
                    borderDash: [5, 5],
                    backgroundColor: 'rgba(16, 185, 129, 0.02)',
                    borderWidth: 2.5,
                    tension: 0.3,
                    fill: false
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'top',
                    labels: { color: '#94a3b8', font: { family: 'Inter', size: 11 } }
                }
            },
            scales: {
                x: {
                    grid: { color: 'rgba(255,255,255,0.03)' },
                    ticks: { color: '#64748b' }
                },
                y: {
                    grid: { color: 'rgba(255,255,255,0.03)' },
                    ticks: {
                        color: '#64748b',
                        callback: function(value) { return 'R$ ' + value.toLocaleString('pt-BR'); }
                    }
                }
            }
        }
    });
    
    // B) GRÁFICO 2: DISTRIBUIÇÃO DE CATEGORIAS (DONUT)
    const ctxCategory = document.getElementById('category-chart').getContext('2d');
    if (categoryChartInstance) {
        categoryChartInstance.destroy();
    }
    
    const categoriesSum = {
        'Alimentação': 0,
        'Transporte': 0,
        'Lazer': 0,
        'Saúde': 0,
        'Moradia': 0,
        'Outros': 0
    };
    
    // Contar despesas variáveis
    state.transactions.forEach(t => {
        if (t.type.startsWith('expense') && categoriesSum[t.category] !== undefined) {
            categoriesSum[t.category] += t.value;
        }
    });
    
    // Também incluir despesas fixas fundamentais nas devidas categorias para visão ampla
    categoriesSum['Moradia'] += rent + bills;
    categoriesSum['Alimentação'] += market;
    categoriesSum['Outros'] += consortium + card; // Considerar consórcio e cartão geral como outros/misto
    
    const categoryLabels = [];
    const categoryValues = [];
    
    for (const [cat, val] of Object.entries(categoriesSum)) {
        if (val > 0) {
            categoryLabels.push(cat);
            categoryValues.push(val);
        }
    }
    
    categoryChartInstance = new Chart(ctxCategory, {
        type: 'doughnut',
        data: {
            labels: categoryLabels,
            datasets: [{
                data: categoryValues,
                backgroundColor: [
                    '#3b82f6', // Alimentação (Azul)
                    '#f59e0b', // Transporte (Laranja)
                    '#ec4899', // Lazer (Rosa)
                    '#10b981', // Saúde (Verde)
                    '#6366f1', // Moradia (Roxo)
                    '#64748b'  // Outros (Cinza)
                ],
                borderWidth: 1,
                borderColor: '#0f101a'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'right',
                    labels: { color: '#94a3b8', font: { family: 'Inter', size: 10 } }
                }
            }
        }
    });
    
    // C) GRÁFICO 3: CLASSIFICAÇÃO DOS GASTOS (ESSENCIAL VS SUPÉRFLUO) (DONUT)
    const ctxNecessity = document.getElementById('necessity-chart').getContext('2d');
    if (necessityChartInstance) {
        necessityChartInstance.destroy();
    }
    
    let essentialSum = rent + bills + market; // Moradia básica e alimentação básica são essenciais
    let superfluousSum = consortium + card; // Financiamentos longos/consórcio e fatura geral variam
    
    state.transactions.forEach(t => {
        if (t.type.startsWith('expense')) {
            if (t.essential) {
                essentialSum += t.value;
            } else {
                superfluousSum += t.value;
            }
        }
    });
    
    necessityChartInstance = new Chart(ctxNecessity, {
        type: 'doughnut',
        data: {
            labels: ['Essenciais (Sobrevivência)', 'Supérfluos (Conforto/Lazer)'],
            datasets: [{
                data: [essentialSum, superfluousSum],
                backgroundColor: [
                    'rgba(16, 185, 129, 0.85)', // Essenciais (Verde)
                    'rgba(239, 68, 68, 0.85)'   // Supérfluos (Vermelho)
                ],
                borderWidth: 1,
                borderColor: '#0f101a'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { color: '#94a3b8', font: { family: 'Inter', size: 10 } }
                }
            }
        }
    });
}

// SANDBOX DE SIMULAÇÃO DE CENÁRIOS IA
function runSandboxSimulation() {
    const salaryIncrease = parseFloat(document.getElementById('slide-salary').value) || 0;
    const rentCutPercent = parseFloat(document.getElementById('slide-rent-cut').value) || 0;
    const extraSavings = parseFloat(document.getElementById('slide-extra-savings').value) || 0;
    
    // Atualizar rótulos em tempo real na tela
    document.getElementById('val-slide-salary').textContent = `+ ${formatCurrency(salaryIncrease)}`;
    document.getElementById('val-slide-rent').textContent = `-${rentCutPercent}%`;
    document.getElementById('val-slide-savings').textContent = formatCurrency(extraSavings);
    
    // Cálculos da base atual
    const fixedSalary = parseFloat(state.profile.salary) || 0;
    const otherIncome = parseFloat(state.profile.otherIncome) || 0;
    const rent = parseFloat(state.profile.rent) || 0;
    const consortium = parseFloat(state.profile.consortium) || 0;
    const card = parseFloat(state.profile.card) || 0;
    const bills = parseFloat(state.profile.bills) || 0;
    const market = parseFloat(state.profile.market) || 0;
    
    const dynamicFixedExpensesSum = state.transactions
        .filter(t => t.type === 'expense-fixed')
        .reduce((acc, t) => acc + t.value, 0);
        
    const extraIncomesSum = state.transactions
        .filter(t => t.type === 'income-extra')
        .reduce((acc, t) => acc + t.value, 0);
        
    const totalIncome = fixedSalary + otherIncome + extraIncomesSum;
    const totalFixedExpenses = rent + consortium + card + bills + market + dynamicFixedExpensesSum;
    const totalVariableExpenses = state.transactions
        .filter(t => t.type === 'expense-variable')
        .reduce((acc, t) => acc + t.value, 0);
        
    const currentBalance = totalIncome - (totalFixedExpenses + totalVariableExpenses);
    
    // CALCULAR IMPACTO DO CENÁRIO SIMULADO
    const newIncome = totalIncome + salaryIncrease;
    
    // Redução do aluguel / moradia
    const rentSavings = rent * (rentCutPercent / 100);
    const newFixedExpenses = totalFixedExpenses - rentSavings;
    
    // Novo excedente mensal
    const newSurplus = newIncome - (newFixedExpenses + totalVariableExpenses) - extraSavings;
    
    document.getElementById('sim-new-surplus').textContent = formatCurrency(newSurplus + extraSavings);
    
    // Patrimônio projetado para 12 meses sob este novo regime
    let projectedPatrimony12m = state.emergencyReserve;
    state.goals.forEach(g => projectedPatrimony12m += g.saved);
    
    // Acumular o novo saldo poupado (Nova Sobra + Poupança extra simulada)
    projectedPatrimony12m += (newSurplus + extraSavings) * 12;
    
    document.getElementById('sim-new-patrimony').textContent = formatCurrency(projectedPatrimony12m);
    
    // Tempo para bater a Reserva de emergência de 6 meses
    const targetReserve = newFixedExpenses * 6;
    if (state.emergencyReserve >= targetReserve) {
        document.getElementById('sim-reserve-time').textContent = 'Já Atingida';
        document.getElementById('sim-reserve-time').style.color = 'var(--accent-green)';
    } else {
        const monthlyAllocation = Math.max(100, newSurplus * 0.8 + extraSavings);
        const monthsNeeded = (targetReserve - state.emergencyReserve) / monthlyAllocation;
        
        if (monthsNeeded > 48) {
            document.getElementById('sim-reserve-time').textContent = 'Acima de 4 anos';
            document.getElementById('sim-reserve-time').style.color = 'var(--accent-red)';
        } else {
            document.getElementById('sim-reserve-time').textContent = `${Math.ceil(monthsNeeded)} meses`;
            document.getElementById('sim-reserve-time').style.color = 'var(--accent-orange)';
        }
    }
}

// ASSISTENTE DE IA INTERATIVO - CHAT E RESPOSTAS DINÂMICAS
const chatContainer = document.getElementById('chat-messages-container');

function updateAIConsultantWelcome() {
    const fixedSalary = parseFloat(state.profile.salary) || 0;
    const otherIncome = parseFloat(state.profile.otherIncome) || 0;
    const rent = parseFloat(state.profile.rent) || 0;
    const consortium = parseFloat(state.profile.consortium) || 0;
    const card = parseFloat(state.profile.card) || 0;
    const bills = parseFloat(state.profile.bills) || 0;
    const market = parseFloat(state.profile.market) || 0;
    
    const dynamicFixedExpensesSum = state.transactions
        .filter(t => t.type === 'expense-fixed')
        .reduce((acc, t) => acc + t.value, 0);
        
    const extraIncomesSum = state.transactions
        .filter(t => t.type === 'income-extra')
        .reduce((acc, t) => acc + t.value, 0);
        
    const totalIncome = fixedSalary + otherIncome + extraIncomesSum;
    const totalFixed = rent + consortium + card + bills + market + dynamicFixedExpensesSum;
    const totalVar = state.transactions.filter(t => t.type === 'expense-variable').reduce((acc, t) => acc + t.value, 0);
    const balance = totalIncome - (totalFixed + totalVar);
    const months = state.emergencyReserve / (totalFixed > 0 ? totalFixed : 1000);
    
    let welcomeMsg = `Olá! Sou o seu consultor financeiro **Polly e Thi finance** 🤖.<br><br>`;
    welcomeMsg += `Analisei o seu perfil atual:<br>`;
    welcomeMsg += `&bull; **Renda Total:** ${formatCurrency(totalIncome)}<br>`;
    welcomeMsg += `&bull; **Despesas Fixas:** ${formatCurrency(totalFixed)} (${((totalFixed/totalIncome)*100).toFixed(0)}% do orçamento)<br>`;
    welcomeMsg += `&bull; **Sobra Mensal Estimada:** ${formatCurrency(balance)}<br>`;
    welcomeMsg += `&bull; **Reserva:** Cobre **${months.toFixed(1)} meses**.<br><br>`;
    
    if (balance < 0) {
        welcomeMsg += `⚠️ **Atenção imediata:** Suas contas estão no vermelho. Você está gastando mais do que ganha. Pergunte-me por **"dicas de corte inteligente"** para reverter este cenário agora mesmo!`;
    } else if (months < 6) {
        welcomeMsg += `💡 **Foco Recomendado:** Suas despesas do mês estão controladas, mas seu colchão de segurança está baixo. Sugiro priorizar sua reserva antes de efetuar novos gastos supérfluos. Quer simular uma compra? Digite abaixo!`;
    } else {
        welcomeMsg += `🚀 **Excelente Saúde!** Suas contas estão sólidas. Pergunte-me sobre opções de investimentos ou planeje metas de médio prazo comigo!`;
    }
    
    chatContainer.innerHTML = `<div class="message system">${welcomeMsg}</div>`;
}

function clearChat() {
    chatContainer.innerHTML = '';
    updateAIConsultantWelcome();
}

function addAIMessage(sender, text) {
    const bubble = document.createElement('div');
    bubble.className = sender === 'USER' ? 'message user' : 'message ai';
    bubble.innerHTML = text;
    chatContainer.appendChild(bubble);
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

function handleChatSubmit(e) {
    e.preventDefault();
    const input = document.getElementById('chat-user-message');
    const msg = input.value.trim();
    if (!msg) return;
    
    askAIConsultant(msg);
    input.value = '';
}

function askAIConsultant(userQuery) {
    // 1. Exibir mensagem do usuário na tela
    addAIMessage('USER', userQuery);
    
    // Efeito visual de digitação rápida
    const typingBubble = document.createElement('div');
    typingBubble.className = 'message ai typing';
    typingBubble.innerHTML = 'IA pensando...';
    chatContainer.appendChild(typingBubble);
    chatContainer.scrollTop = chatContainer.scrollHeight;
    
    // Obter dados financeiros em tempo real
    const fixedSalary = parseFloat(state.profile.salary) || 0;
    const otherIncome = parseFloat(state.profile.otherIncome) || 0;
    const rent = parseFloat(state.profile.rent) || 0;
    const consortium = parseFloat(state.profile.consortium) || 0;
    const card = parseFloat(state.profile.card) || 0;
    const bills = parseFloat(state.profile.bills) || 0;
    const market = parseFloat(state.profile.market) || 0;
    
    const dynamicFixedSum = state.transactions
        .filter(t => t.type === 'expense-fixed')
        .reduce((acc, t) => acc + t.value, 0);
        
    const extraIncomeSum = state.transactions
        .filter(t => t.type === 'income-extra')
        .reduce((acc, t) => acc + t.value, 0);
        
    const totalIncome = fixedSalary + otherIncome + extraIncomeSum;
    const totalFixed = rent + consortium + card + bills + market + dynamicFixedSum;
    const totalVar = state.transactions.filter(t => t.type === 'expense-variable').reduce((acc, t) => acc + t.value, 0);
    const balance = totalIncome - (totalFixed + totalVar);
    const safeReserveTarget = totalFixed * 6;
    
    setTimeout(() => {
        // Remover a bolha de digitando
        typingBubble.remove();
        
        let response = '';
        const q = userQuery.toLowerCase();
        
        // 2. PARSEADOR INTELIGENTE DE PERGUNTAS E INTENÇÃO FINANCEIRA
        
        // CASO A: SIMULAÇÃO DE COMPRA DE VALOR ESPECÍFICO
        if (q.includes('compra') || q.includes('comprar') || q.includes('celular') || q.includes('computador') || q.includes('notebook') || q.includes('carro') || q.includes('gastar')) {
            const matchValue = q.match(/r?\$\s?(\d+([\.,]\d+)?)/i);
            const valueRequested = matchValue ? parseFloat(matchValue[1].replace('.', '').replace(',', '.')) : 3000;
            const matchInstallments = q.match(/(\d+)\s?x/i);
            const installmentsRequested = matchInstallments ? parseInt(matchInstallments[1]) : 10;
            const monthlyInstallment = valueRequested / installmentsRequested;
            
            response = `🎯 **Simulador de Impacto Financeiro da IA:**<br><br>`;
            response += `Você deseja simular uma compra de **${formatCurrency(valueRequested)}** parcelada em **${installmentsRequested}x de ${formatCurrency(monthlyInstallment)}**.<br><br>`;
            
            if (balance <= 0) {
                response += `❌ **Veredicto: Reprovado!**<br>`;
                response += `Suas finanças estão no vermelho (${formatCurrency(Math.abs(balance))}). Adicionar mais gastos acelerará o endividamento.`;
            } else if (monthlyInstallment > balance) {
                response += `⚠️ **Veredicto: Inviável!**<br>`;
                response += `Sua sobra mensal é de **${formatCurrency(balance)}**, menor que a parcela de **${formatCurrency(monthlyInstallment)}**.`;
            } else {
                response += `✅ **Veredicto: Possível.**<br>`;
                response += `A parcela de **${formatCurrency(monthlyInstallment)}** cabe na sua sobra mensal.`;
            }
        } else if (q.includes('dica') || q.includes('economizar') || q.includes('ajuda')) {
            response = `💡 **Dicas para sua realidade:**<br>`;
            response += `1. Seus gastos variáveis somam **${formatCurrency(totalVar)}**. Tente reduzir 10% disso.<br>`;
            response += `2. Sua reserva de emergência está em **${formatCurrency(state.emergencyReserve)}**. O ideal seria **${formatCurrency(safeReserveTarget)}**.`;
        } else {
            response = "Olá! Como posso ajudar com suas finanças hoje? Posso simular compras ou dar dicas de economia baseadas nos seus dados.";
        }
        addAIMessage('IA', response);
    }, 1000);
}
                if (ratioCompromised > 80) {
                    response += `🟡 **Veredicto: Risco Elevado (Média Alerta).**<br>`;
                    response += `A parcela de **${formatCurrency(monthlyInstallment)}** cabe na sobra mensal de **${formatCurrency(balance)}**, mas elevará a sua taxa de comprometimento para **${ratioCompromised.toFixed(0)}%** do orçamento, ultrapassando os 80% seguros.<br>`;
                    response += `**Sugestão Inteligente:** Guarde **${formatCurrency(monthlyInstallment)}** por **${installmentsRequested} meses** em uma aplicação para comprar este item inteiramente à vista com desconto!`;
                } else {
                    response += `✅ **Veredicto: Viável!**<br>`;
                    response += `Essa compra cabe tranquilamente em suas contas! A parcela de **${formatCurrency(monthlyInstallment)}** compromete apenas **${((monthlyInstallment/totalIncome)*100).toFixed(1)}%** de sua receita mensal. Sua sobra líquida será reajustada para **${formatCurrency(balance - monthlyInstallment)}**, mantendo-se no azul. Prossiga com moderação!`;
                }
            }
        }
        
        // CASO B: ACELERAR RESERVA DE EMERGÊNCIA
        else if (q.includes('reserva') || q.includes('segurança') || q.includes('emergência') || q.includes('poupar') || q.includes('emergencia')) {
            response = `🛡️ **Raio-x da sua Reserva de Emergência:**<br><br>`;
            response += `Sua meta ideal de colchão de segurança é de **${formatCurrency(safeReserveTarget)}** (equivalente a 6 meses das despesas essenciais fundamentais de ${formatCurrency(totalFixed)}).<br>`;
            response += `Atualmente, você tem acumulado **${formatCurrency(state.emergencyReserve)}** (cobertura de **${(state.emergencyReserve / (totalFixed || 1)).toFixed(1)} meses**).<br><br>`;
            
            if (balance <= 0) {
                response += `Para conseguir montar sua reserva, você precisa primeiro estancar a sangria financeira. Seu saldo está negativo. Sugiro cortar gastos essenciais não fundamentais (como reduzir mercado em 10% e lazer em 40%) para gerar uma sobra e começar a poupar.`;
            } else {
                const saving80 = balance * 0.8;
                const monthsToTarget = (safeReserveTarget - state.emergencyReserve) / saving80;
                
                response += `**Estratégia Recomendada por IA:**<br>`;
                response += `1. Destine **80% de sua sobra mensal (${formatCurrency(saving80)})** para a reserva automaticamente no dia do recebimento do salário.<br>`;
                
                if (monthsToTarget <= 0) {
                    response += `2. **Você já atingiu sua meta segura!** Parabéns! O excedente mensal agora pode ser aplicado em investimentos de maior liquidez ou metas de lazer.`;
                } else {
                    response += `2. Mantendo essa disciplina, você atingirá os 6 meses recomendados em exatos **${Math.ceil(monthsToTarget)} meses**.<br>`;
                    response += `3. Para acelerar esse prazo para **${Math.ceil(monthsToTarget * 0.7)} meses**, reduza seus gastos com Lazer em **R$ 150,00/mês** e aumente a alocação da reserva.`;
                }
            }
        }
        
        // CASO C: RAIO-X DE GASTOS E CORTES
        else if (q.includes('raio') || q.includes('corte') || q.includes('cortar') || q.includes('gasto') || q.includes('consumo')) {
            const leisureSum = state.transactions.filter(t => t.category === 'Lazer').reduce((acc, t) => acc + t.value, 0);
            const foodSum = state.transactions.filter(t => t.category === 'Alimentação').reduce((acc, t) => acc + t.value, 0);
            const transSum = state.transactions.filter(t => t.category === 'Transporte').reduce((acc, t) => acc + t.value, 0);
            
            response = `🔍 **Raio-x Financeiro de Consumo & Otimizações IA:**<br><br>`;
            response += `Analisamos seus lançamentos do mês e identificamos os seguintes pesos:<br>`;
            response += `&bull; **Gastos com Lazer:** ${formatCurrency(leisureSum)}<br>`;
            response += `&bull; **Alimentação:** ${formatCurrency(foodSum)}<br>`;
            response += `&bull; **Transporte/Deslocamentos:** ${formatCurrency(transSum)}<br><br>`;
            
            response += `**Sugestões de Cortes Inteligentes:**<br>`;
            
            if (leisureSum > 200) {
                response += `1. **Lazer / Confortos:** Há espaço de manobra aqui. Reduzir 20% do Lazer (${formatCurrency(leisureSum * 0.2)}) representa uma economia imediata de **${formatCurrency(leisureSum * 0.2)}** sem comprometer seriamente sua qualidade de vida.<br>`;
            }
            if (transSum > 150) {
                response += `2. **Transporte:** Seus gastos com corridas curtas estão acumulando. Tente mesclar trajetos com transporte coletivo ou concentrar saídas, reduzindo cerca de 15% das corridas de aplicativo.<br>`;
            }
            
            response += `3. **Despesas Fixas Estáveis:** Verifique se as taxas de assinatura de internet, celular e serviços de streaming não podem ser renegociadas. Ligar na operadora geralmente rende descontos de 10% a 20% no valor mensal!`;
        }
        
        // CASO D: RISCO DE DÉFICIT FINANCEIRO COM R$ 500 EXTRAS
        else if (q.includes('vermelho') || q.includes('déficit') || q.includes('risco') || q.includes('perigo') || q.includes('extra') || q.includes('sobra')) {
            response = `⚖️ **Simulador de Risco de Déficit:**<br><br>`;
            response += `Sua sobra livre mensal hoje é de **${formatCurrency(balance)}**.<br><br>`;
            
            if (balance <= 0) {
                response += `🚨 **Você já está no vermelho!** Qualquer gasto extra aumentará diretamente o seu rombo e forçará o uso de rotativos de juros altos. Não faça novos gastos.`;
            } else if (balance < 500) {
                response += `⚠️ **Risco Imediato Elevado!** Seu saldo de sobra é de apenas **${formatCurrency(balance)}**. Um gasto inesperado de **R$ 500,00** consumirá toda a sua sobra e empurrará suas contas para um saldo negativo de **${formatCurrency(balance - 500)}**. Evite ao máximo!`;
            } else {
                response += `🟢 **Zona de Segurança.** Um gasto pontual de R$ 500,00 reduzirá temporariamente sua sobra para **${formatCurrency(balance - 500)}**, mas não o jogará no vermelho. Suas despesas continuam abaixo de 80% da receita total.`;
            }
        }
        
        // CASO PADRÃO: CHAT GERAL FINANCEIRO
        else {
            response = `🤖 **Entendido! Análise Polly e Thi finance:**<br><br>`;
            response += `Com base no seu perfil financeiro (Salário: ${formatCurrency(fixedSalary)} | Sobra: ${formatCurrency(balance)}), aqui estão os pilares fundamentais:<br><br>`;
            response += `1. **Sua taxa de economia** está em **${((balance/totalIncome)*100).toFixed(0)}%**. O teto saudável de segurança é de 20%.<br>`;
            response += `2. **Suas metas** estão ativas e demandam aportes. Para bater a meta de seu Notebook Novo mais rápido, configure aportes de R$ 150 mensais direto na aba de Metas.<br><br>`;
            response += `Como posso te ajudar especificamente hoje? Experimente perguntar se um item como **"posso comprar uma TV de R$ 2000 em 5x"** cabe nas suas contas!`;
        }
        
        addAIMessage('IA', response);
    }, 1000);
}

// ==================== CONTROLES DE AUTENTICAÇÃO E SINCRONIZAÇÃO REST ====================

// Alternar formulários na Overlay de Login
function toggleAuthForm(mode) {
    const loginForm = document.getElementById('auth-login-form');
    const registerForm = document.getElementById('auth-register-form');
    
    if (mode === 'login') {
        loginForm.classList.remove('hidden');
        registerForm.classList.add('hidden');
    } else {
        loginForm.classList.add('hidden');
        registerForm.classList.remove('hidden');
    }
}

// Verificar se existe sessão guardada localmente
function checkAuthSession() {
    const storedUser = localStorage.getItem('finance_user');
    const authOverlay = document.getElementById('auth-overlay');
    
    if (storedUser) {
        state.currentUser = JSON.parse(storedUser);
        authOverlay.style.display = 'none';
        
        // Carregar dados dinâmicos do backend
        loadUserFinancials();
    } else {
        state.currentUser = null;
        authOverlay.style.display = 'flex';
    }
}

// Tratar Login no Backend
async function handleAuthLogin(e) {
    e.preventDefault();
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    
    if (!email || !password) return;
    
    try {
        const res = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        
        const data = await res.json();
        
        if (data.error) {
            alert(data.error);
            return;
        }
        
        // Guardar usuário na sessão local
        state.currentUser = data.user;
        localStorage.setItem('finance_user', JSON.stringify(data.user));
        
        // Esconder tela de login
        document.getElementById('auth-overlay').style.display = 'none';
        
        // Carregar os dados
        loadUserFinancials();
    } catch (err) {
        console.error('Erro de Login:', err);
        alert('Não foi possível conectar ao servidor backend.');
    }
}

// Tratar Registro no Backend
async function handleAuthRegister(e) {
    e.preventDefault();
    const name = document.getElementById('register-name').value.trim();
    const email = document.getElementById('register-email').value.trim();
    const password = document.getElementById('register-password').value;
    
    if (!name || !email || !password) return;
    
    if (password.length < 6) {
        alert('A senha deve conter no mínimo 6 caracteres.');
        return;
    }
    
    try {
        const res = await fetch('/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, email, password })
        });
        
        const data = await res.json();
        
        if (data.error) {
            alert(data.error);
            return;
        }
        
        alert('Conta criada com sucesso! Carregando dados iniciais...');
        
        // Fazer login automático
        state.currentUser = data.user;
        localStorage.setItem('finance_user', JSON.stringify(data.user));
        
        // Esconder tela de login
        document.getElementById('auth-overlay').style.display = 'none';
        
        loadUserFinancials();
    } catch (err) {
        console.error('Erro de Cadastro:', err);
        alert('Não foi possível conectar ao servidor backend.');
    }
}

// Fazer Logout da Conta
function logoutUser() {
    localStorage.removeItem('finance_user');
    state.currentUser = null;
    state.profile = { salary: 0, otherIncome: 0, rent: 0, consortium: 0, card: 0, bills: 0, market: 0 };
    state.transactions = [];
    state.monthSummaries = {};
    state.goals = [];
    state.emergencyReserve = 0;
    state.activeMonth = getYearMonth();

    if (patrimonyChartInstance) patrimonyChartInstance.destroy();
    if (categoryChartInstance) categoryChartInstance.destroy();
    if (necessityChartInstance) necessityChartInstance.destroy();

    document.getElementById('auth-overlay').style.display = 'flex';
    document.getElementById('auth-login-form').reset();
    document.getElementById('auth-register-form').reset();
    switchTab('dashboard');
}

// Carregar Dados Financeiros via REST API
async function loadUserFinancials() {
    if (!state.currentUser) return;

    try {
        // 1. Carregar perfil + metas + resumo de meses
        const res = await fetch('/api/financials', {
            method: 'GET',
            headers: { 'Content-Type': 'application/json', 'x-user-id': state.currentUser.id }
        });
        const data = await res.json();

        if (data.error) {
            console.error('Erro ao carregar dados:', data.error);
            logoutUser();
            return;
        }

        state.profile = data.profile || state.profile;
        state.goals = data.goals || [];
        state.emergencyReserve = data.emergencyReserve || 0;
        state.monthSummaries = data.months || {};

        // Garantir que o mês atual exista nos resumos
        if (!state.monthSummaries[state.activeMonth]) {
            state.monthSummaries[state.activeMonth] = { transactionCount: 0, totalIncome: 0, totalExpenses: 0, balance: 0 };
        }

        // 2. Carregar transações do mês ativo
        const resMonth = await fetch(`/api/months/${state.activeMonth}`, {
            headers: { 'Content-Type': 'application/json', 'x-user-id': state.currentUser.id }
        });
        const monthData = await resMonth.json();
        state.transactions = monthData.transactions || [];

        // Atualizar UI
        loadProfileIntoForm();
        document.getElementById('sidebar-user-name').textContent = state.currentUser.name;

        const names = state.currentUser.name.split(' ');
        const initials = names.length > 1
            ? (names[0][0] + names[1][0]).toUpperCase()
            : (names[0][0] + (names[0][1] || '')).toUpperCase();
        document.getElementById('sidebar-user-avatar').textContent = initials;

        updateMonthNavigator();
        recalculateAll();
        updateAIConsultantWelcome();

    } catch (err) {
        console.error('Erro de sincronização:', err);
        alert('Erro ao carregar dados do servidor.');
    }
}

// Salvar Perfil Base no Backend (sem transações — transações têm rotas próprias)
async function saveUserFinancials() {
    if (!state.currentUser) return;

    try {
        await fetch('/api/financials', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-user-id': state.currentUser.id },
            body: JSON.stringify({
                profile: state.profile,
                goals: state.goals,
                emergencyReserve: state.emergencyReserve
            })
        });
    } catch (err) {
        console.error('Erro ao salvar:', err);
    }
}
