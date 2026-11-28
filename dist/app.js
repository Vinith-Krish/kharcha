const CATEGORIES = [
  {name:'Food & Groceries', icon:'🛒', color:'#e7a33d', terms:['grocery','groceries','food','vegetable','vegetables','milk','restaurant','swiggy','zomato','chai','tea']},
  {name:'Rent & Home', icon:'🏠', color:'#376c58', terms:['rent','home','maintenance','furniture','electricity','water','gas','bill']},
  {name:'Travel & Fuel', icon:'🛺', color:'#5987a6', terms:['fuel','petrol','diesel','auto','cab','uber','ola','metro','bus','train','travel']},
  {name:'Shopping', icon:'🛍️', color:'#c86d61', terms:['shopping','clothes','amazon','flipkart','myntra','shoes']},
  {name:'Health', icon:'💊', color:'#54a079', terms:['medicine','doctor','hospital','health','pharmacy','gym']},
  {name:'Bills & Recharge', icon:'📱', color:'#8775ad', terms:['recharge','internet','wifi','mobile','subscription','ott','netflix']},
  {name:'Education', icon:'📚', color:'#b9793e', terms:['book','course','school','college','fees','education']},
  {name:'Entertainment', icon:'🎬', color:'#d66f88', terms:['movie','cinema','game','entertainment']},
  {name:'Family & Gifts', icon:'🎁', color:'#c15d91', terms:['gift','family','parents','festival']},
  {name:'Investment', icon:'📈', color:'#388c75', terms:['investment','sip','mutual fund','stocks','savings']},
  {name:'Other', icon:'✨', color:'#8b948f', terms:[]}
];
const PAYMENT_COLORS={'UPI':'#1f654e','Cash':'#eda23e','Credit Card':'#6d76ad','Debit Card':'#5792a0','Net Banking':'#9b7559','Other':'#909891'};
const PAYMENT_OPTIONS=['UPI','Cash','Credit Card','Debit Card','Net Banking','Other'];
const STORAGE_KEY='kharcha.v1';
const today=new Date();
const currentMonthKey=()=>`${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}`;
let state={salaries:{},expenses:[],additions:[]};
let selectedMonth=currentMonthKey();
let recognition=null;
let toastTimer;
let cloudApi=null;
let cloudUser=null;
let applyingCloudData=false;
let wasSignedIn=false;
let editingExpenseId=null;
let showAllTransactions=false;
let showBalance=false;
let showIncome=false;

const $=id=>document.getElementById(id);
const money=n=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:Math.abs(n%1)>0?2:0}).format(Number(n)||0);
const balanceMoney=n=>showBalance?money(n):'••••';
const incomeMoney=n=>showIncome?money(n):'••••';
const monthLabel=key=>new Date(`${key}-02T00:00:00`).toLocaleDateString('en-IN',{month:'long',year:'numeric'});
const escapeHtml=s=>String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const isMonthKey=key=>/^\d{4}-(0[1-9]|1[0-2])$/.test(key||'');
const isIsoDate=value=>/^\d{4}-\d{2}-\d{2}$/.test(value||'')&&!Number.isNaN(new Date(`${value}T12:00:00`).getTime());
const csvSafe=value=>{const text=String(value??'');return /^[\s\u0000-\u001f]*[=+\-@]/.test(text)?`'${text}`:text;};

function normalizeState(raw){
  const source=raw&&typeof raw==='object'?raw:{};
  const salaries={};
  if(source.salaries&&typeof source.salaries==='object'){
    Object.entries(source.salaries).forEach(([key,value])=>{
      if(!isMonthKey(key))return;
      const amount=Number(value);
      if(Number.isFinite(amount)&&amount>=0)salaries[key]=Math.round(amount*100)/100;
    });
  }
  const expenses=[];
  const seen=new Set();
  if(Array.isArray(source.expenses)){
    source.expenses.forEach(item=>{
      if(!item||typeof item!=='object')return;
      const amount=Number(item.amount);
      const date=isIsoDate(item.date)?item.date:new Date().toISOString().slice(0,10);
      if(!Number.isFinite(amount)||amount<=0)return;
      const id=typeof item.id==='string'&&item.id.trim()?item.id.trim():(crypto.randomUUID?.()||`${Date.now()}-${Math.random()}`);
      if(seen.has(id))return; seen.add(id);
      const note=String(item.note||'Expense').trim().slice(0,60)||'Expense';
      const category=CATEGORIES.some(c=>c.name===item.category)?item.category:'Other';
      const payment=PAYMENT_OPTIONS.includes(item.payment)?item.payment:'Other';
      const createdAt=Number.isFinite(Number(item.createdAt))?Number(item.createdAt):Date.now();
      expenses.push({id,amount:Math.round(amount*100)/100,note,category,payment,date,createdAt});
    });
  }
  const additions=[];
  const seenAdditions=new Set();
  if(Array.isArray(source.additions)){
    source.additions.forEach(item=>{
      if(!item||typeof item!=='object'||!isMonthKey(item.month))return;
      const amount=Number(item.amount);
      if(!Number.isFinite(amount)||amount<=0)return;
      const id=typeof item.id==='string'&&item.id.trim()?item.id.trim():(crypto.randomUUID?.()||`${Date.now()}-${Math.random()}`);
      if(seenAdditions.has(id))return;seenAdditions.add(id);
      const note=String(item.note||'Added money').trim().slice(0,60)||'Added money';
      const createdAt=Number.isFinite(Number(item.createdAt))?Number(item.createdAt):Date.now();
      additions.push({id,month:item.month,amount:Math.round(amount*100)/100,note,createdAt});
    });
  }
  return {salaries,expenses,additions};
}

function loadState(){
  try{return normalizeState(JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}'));}catch{return {salaries:{},expenses:[],additions:[]};}
}
function saveState(){if(!cloudUser)return;localStorage.setItem(STORAGE_KEY,JSON.stringify(state));render();if(!applyingCloudData)cloudApi?.push(state);}
function salaryFor(key){return Number(state.salaries[key]||0);}
function additionsFor(key){return state.additions.filter(item=>item.month===key);}
function addedTotalFor(key){return additionsFor(key).reduce((sum,item)=>sum+item.amount,0);}
function monthExpenses(key){return state.expenses.filter(e=>e.date.startsWith(key));}
function totalFor(key){return monthExpenses(key).reduce((sum,e)=>sum+Number(e.amount),0);}
function previousMonth(key){const [y,m]=key.split('-').map(Number);const d=new Date(y,m-2,1);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;}
function carryFor(key,depth=0){
  if(depth>120)return 0;
  const prev=previousMonth(key);const hasPrev=Object.prototype.hasOwnProperty.call(state.salaries,prev)||monthExpenses(prev).length>0||additionsFor(prev).length>0;
  if(!hasPrev)return 0;
  return Math.max(0,salaryFor(prev)+addedTotalFor(prev)+carryFor(prev,depth+1)-totalFor(prev));
}
function totals(){const salary=salaryFor(selectedMonth),added=addedTotalFor(selectedMonth),carry=carryFor(selectedMonth),spent=totalFor(selectedMonth);return {salary,added,carry,spent,budget:salary+added+carry,available:salary+added+carry-spent};}

function render(){
  const t=totals();
  $('availableBalance').textContent=balanceMoney(t.available);
  $('salaryValue').textContent=incomeMoney(t.salary);
  $('addedMoneyValue').textContent=incomeMoney(t.added);
  $('carryValue').textContent=incomeMoney(t.carry);
  $('spentLabel').textContent=`${balanceMoney(t.spent)} spent`;
  $('remainingLabel').textContent=`${balanceMoney(Math.max(0,t.available))} left`;
  [['balanceVisibilityBtn',showBalance,'balance and spending amounts'],['salaryVisibilityBtn',showIncome,'salary and income amounts']].forEach(([id,visible,label])=>{
    const button=$(id);button.setAttribute('aria-pressed',String(visible));button.setAttribute('aria-label',`${visible?'Hide':'Show'} ${label}`);button.title=`${visible?'Hide':'Show'} ${label}`;
  });
  const used=t.budget?Math.min(100,(t.spent/t.budget)*100):0;
  $('budgetProgress').style.width=showBalance?`${used}%`:'0%';
  $('budgetProgress').parentElement.setAttribute('aria-label',showBalance?'Monthly budget used':'Monthly budget hidden');
  const status=$('balanceStatus');status.className='status-pill';
  if(!showBalance){status.textContent='Hidden';$('balanceContext').textContent='Tap the eye to show your balance.';}
  else if(!t.budget){status.textContent='Start here';$('balanceContext').textContent=`Set your salary or add money for ${monthLabel(selectedMonth)} to begin.`;}
  else if(t.available<0){status.textContent='Over budget';status.classList.add('danger');$('balanceContext').textContent=`You have exceeded this month’s available amount by ${money(Math.abs(t.available))}.`;}
  else if(used>75){status.textContent='Watch spending';status.classList.add('warning');$('balanceContext').textContent=`${Math.round(used)}% of your available money has been used.`;}
  else{status.textContent='On track';$('balanceContext').textContent=`You have used ${Math.round(used)}% of ${money(t.budget)} available in ${monthLabel(selectedMonth)}.`;}
  renderCategories(t.spent);renderPayments(t.spent);renderTransactions();
}

function renderCategories(total){
  const grouped={};monthExpenses(selectedMonth).forEach(e=>grouped[e.category]=(grouped[e.category]||0)+Number(e.amount));
  const items=Object.entries(grouped).sort((a,b)=>b[1]-a[1]);
  $('categoryCount').textContent=`${items.length} categor${items.length===1?'y':'ies'}`;$('donutTotal').textContent=balanceMoney(total);
  if(!items.length){$('categoryDonut').style.background='conic-gradient(#dfe6e1 0 100%)';$('categoryLegend').innerHTML='<p class="empty-mini">Your category mix will appear here.</p>';return;}
  let at=0;const stops=[];
  items.forEach(([name,value])=>{const cat=CATEGORIES.find(c=>c.name===name)||CATEGORIES.at(-1);const end=at+(value/total*100);stops.push(`${cat.color} ${at}% ${end}%`);at=end;});
  $('categoryDonut').style.background=`conic-gradient(${stops.join(',')})`;
  $('categoryLegend').innerHTML=items.slice(0,5).map(([name,value])=>{const cat=CATEGORIES.find(c=>c.name===name)||CATEGORIES.at(-1);return `<div class="legend-row"><i style="background:${cat.color}"></i><span>${escapeHtml(name)}<small>${Math.round(value/total*100)}% of spending</small></span><strong>${balanceMoney(value)}</strong></div>`}).join('');
}

function renderPayments(total){
  const grouped={};monthExpenses(selectedMonth).forEach(e=>grouped[e.payment]=(grouped[e.payment]||0)+Number(e.amount));
  const preferred=['UPI','Cash','Credit Card'];const keys=[...preferred.filter(k=>grouped[k]),...Object.keys(grouped).filter(k=>!preferred.includes(k))].slice(0,4);
  if(!keys.length)keys.push('UPI','Cash','Card');
  const max=Math.max(...Object.values(grouped),1);
  $('paymentBars').innerHTML=keys.map(key=>`<div class="payment-bar"><div class="payment-bar-track"><div class="payment-bar-fill" style="height:${((grouped[key]||0)/max)*100}%;background:${PAYMENT_COLORS[key]||'#909891'}"></div></div><strong>${escapeHtml(key)}</strong><small>${total?Math.round((grouped[key]||0)/total*100):0}%</small></div>`).join('');
  const upi=grouped.UPI||0;
  $('upiInsight').textContent=total?`${Math.round(upi/total*100)}% of this month’s expenses were paid by UPI.`:'Add expenses to see your payment habits.';
}

function renderTransactions(showAll=showAllTransactions){
  const expenses=monthExpenses(selectedMonth).sort((a,b)=>b.date.localeCompare(a.date)||b.createdAt-a.createdAt);
  const shown=showAll?expenses:expenses.slice(0,6);
  const allBtn=$('allTransactionsBtn');
  allBtn.hidden=showAll||expenses.length<=6;
  if(showAll||expenses.length<=6)allBtn.textContent='View all'; else allBtn.textContent=`View all (${expenses.length})`;
  if(!shown.length){$('transactionList').innerHTML='<div class="empty-state"><span>🧾</span><strong>No expenses yet</strong><p>Add your first expense manually or by voice.</p></div>';return;}
  $('transactionList').innerHTML=shown.map(e=>{const cat=CATEGORIES.find(c=>c.name===e.category)||CATEGORIES.at(-1);const date=new Date(`${e.date}T12:00:00`).toLocaleDateString('en-IN',{day:'numeric',month:'short'});return `<div class="transaction-row"><button class="transaction-open" type="button" data-edit="${escapeHtml(e.id)}" aria-label="Edit ${escapeHtml(e.note)}"><span class="transaction-icon">${cat.icon}</span><span class="transaction-main"><strong>${escapeHtml(e.note)}</strong><small>${escapeHtml(e.category)} · ${date}</small></span><span class="transaction-amount"><strong>${showBalance?'− '+money(e.amount):'••••'}</strong><small>${escapeHtml(e.payment)}</small></span></button><button class="delete-btn" type="button" data-delete="${escapeHtml(e.id)}" aria-label="Delete ${escapeHtml(e.note)}" title="Delete expense">×</button></div>`}).join('');
}

function renderAddedMoneyHistory(){
  const entries=additionsFor(selectedMonth).sort((a,b)=>b.createdAt-a.createdAt);
  $('addedMoneyHistory').innerHTML=entries.length?`<h3>Added this month</h3>${entries.map(item=>`<div class="added-money-row"><span>${escapeHtml(item.note)}</span><strong>${showIncome?'+ '+money(item.amount):'••••'}</strong><button type="button" data-delete-addition="${escapeHtml(item.id)}" aria-label="Remove ${escapeHtml(item.note)}">×</button></div>`).join('')}`:'<p class="form-help">No money added for this month yet.</p>';
}

function openAddMoney(){
  $('addMoneyForm').reset();
  $('addMoneyMonth').textContent=`Added money increases your available balance for ${monthLabel(selectedMonth)}. Any amount left carries forward.`;
  renderAddedMoneyHistory();
  $('addMoneyDialog').showModal();
  setTimeout(()=>$('addMoneyAmount').focus(),80);
}

function openExpense(prefill={}){
  editingExpenseId=prefill.id||null;
  $('expenseDialogEyebrow').textContent=editingExpenseId?'EDIT ENTRY':'NEW ENTRY';
  $('expenseDialogTitle').textContent=editingExpenseId?'Edit expense':'Add an expense';
  $('expenseSubmitBtn').textContent=editingExpenseId?'Save changes':'Save expense';
  $('expenseForm').reset();$('expenseDate').value=prefill.date||new Date().toISOString().slice(0,10);$('expenseAmount').value=prefill.amount||'';$('expenseNote').value=prefill.note||'';$('expenseCategory').value=prefill.category||'Food & Groceries';$('expensePayment').value=prefill.payment||'UPI';
  const box=$('voiceTranscript');box.hidden=!prefill.transcript;box.querySelector('p').textContent=prefill.transcript||'';$('expenseDialog').showModal();setTimeout(()=>$(prefill.amount?'expenseNote':'expenseAmount').focus(),80);
}
function detectCategory(text){const lower=text.toLowerCase();return CATEGORIES.find(c=>c.terms.some(t=>lower.includes(t)))?.name||'Other';}
function parseVoice(text){
  const clean=text.toLowerCase().replace(/,/g,'');const amountMatch=clean.match(/(?:₹|rs\.?|rupees?|rupaye|रुपये)?\s*(\d+(?:\.\d{1,2})?)/i);const amount=amountMatch?amountMatch[1]:'';
  let payment='UPI';if(/\bcash\b|नकद/i.test(clean))payment='Cash';else if(/credit card/i.test(clean))payment='Credit Card';else if(/debit card/i.test(clean))payment='Debit Card';else if(/net ?banking/i.test(clean))payment='Net Banking';else if(/upi|gpay|google pay|phonepe|paytm/i.test(clean))payment='UPI';
  let note=clean.replace(/(?:₹|rs\.?|rupees?|rupaye|रुपये)?\s*\d+(?:\.\d{1,2})?/i,'').replace(/(?:paid\s+)?(?:via|using|by|on|with)\s+(upi|cash|credit card|debit card|net ?banking|gpay|google pay|phonepe|paytm)/i,'').replace(/\b(for|of|ka|ke liye)\b/i,'').trim();
  note=note?note.replace(/\b\w/g,c=>c.toUpperCase()):'Expense';return {amount,note,payment,category:detectCategory(clean),transcript:text};
}
function startVoice(){
  const SpeechRecognition=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!SpeechRecognition){showToast('Voice input is not supported here. Try Chrome or Edge.');openExpense();return;}
  if(recognition){recognition.stop();return;}
  recognition=new SpeechRecognition();recognition.lang='en-IN';recognition.interimResults=false;recognition.maxAlternatives=1;
  document.querySelectorAll('#voiceBtn,#mobileVoiceBtn').forEach(b=>b.classList.add('listening'));$('voiceBtn').querySelector('strong').textContent='Listening…';
  recognition.onresult=e=>{const transcript=e.results[0][0].transcript;const parsed=parseVoice(transcript);openExpense(parsed);if(!parsed.amount)showToast('I heard you, but please add the amount.');};
  recognition.onerror=e=>{if(e.error!=='aborted')showToast(e.error==='not-allowed'?'Microphone permission was blocked.':'Could not hear that. Please try again.');};
  recognition.onend=()=>{recognition=null;document.querySelectorAll('#voiceBtn,#mobileVoiceBtn').forEach(b=>b.classList.remove('listening'));$('voiceBtn').querySelector('strong').textContent='Speak an expense';};recognition.start();
}
function showToast(message){clearTimeout(toastTimer);$('toast').textContent=message;$('toast').classList.add('show');toastTimer=setTimeout(()=>$('toast').classList.remove('show'),3200);}
function setSyncStatus(status,message=''){
  const chip=$('syncStatusBtn');chip.className=`sync-chip ${status}`;
  const labels={offline:'Device only',syncing:'Syncing…',synced:'Synced',error:'Sync issue',setup:'Sync setup'};
  chip.querySelector('b').textContent=labels[status]||'Cloud sync';
  if(message&&status==='error')showToast(message);
}
function updateAuthUi(user){
  cloudUser=user;
  if(user){
    if(!wasSignedIn){state=loadState();wasSignedIn=true;render();}
    $('appShell').hidden=false;$('mobileNav').hidden=false;$('accessGate').hidden=true;$('gateError').textContent='';
  }else{
    if(wasSignedIn){localStorage.removeItem(STORAGE_KEY);state={salaries:{},expenses:[],additions:[]};wasSignedIn=false;showBalance=false;showIncome=false;}
    $('appShell').hidden=true;$('mobileNav').hidden=true;$('accessGate').hidden=false;
  }
  $('signedInCard').hidden=!user;$('signedInActions').hidden=!user;$('authFields').hidden=!!user;$('signedOutActions').hidden=!!user;
  $('authHelp').hidden=!!user;$('authTitle').textContent=user?'Cloud sync is on':'Sign in';$('signedInEmail').textContent=user?.email||'';
  const note=document.querySelector('.privacy-note p');
  if(note)note.textContent='Your records sync with your private account.';
}
function openAuthDialog(){
  $('authError').textContent='';updateAuthUi(cloudUser);$('authDialog').showModal();
  if(!cloudUser)setTimeout(()=>$('authEmail').focus(),80);
}
function authErrorMessage(error){
  const code=error?.code||'';if(code.includes('invalid-credential'))return'Incorrect email or password.';if(code.includes('operation-not-allowed'))return'Email sign-in is still being enabled. Please try again shortly.';return error?.message?.replace(/^Firebase:\s*/,'')||'Could not sign in.';
}
async function initializeCloud(){
  setSyncStatus('syncing');
  try{
    const {createCloudSync}=await import('./sync.js?v=13');
    cloudApi=await createCloudSync({
      getLocalData:()=>({salaries:state.salaries,expenses:state.expenses,additions:state.additions}),
      onData:data=>{if(!cloudUser)return;const next=normalizeState(data);applyingCloudData=true;state.salaries=next.salaries;state.expenses=next.expenses;state.additions=next.additions;localStorage.setItem(STORAGE_KEY,JSON.stringify(state));render();if($('addMoneyDialog').open)renderAddedMoneyHistory();applyingCloudData=false;},
      onUser:user=>updateAuthUi(user),
      onStatus:setSyncStatus
    });
  }catch(error){$('gateError').textContent='Sign-in is unavailable right now. Please try again later.';setSyncStatus('error','Cloud sign-in is temporarily unavailable.');console.error(error);}
}
function exportCsv(){
  if(!state.expenses.length&&!state.additions.length&&!Object.keys(state.salaries).length){showToast('There are no records to export yet.');return;}
  const entries=[
    ...Object.entries(state.salaries).map(([month,amount])=>[`${month}-01`,'Monthly salary','Salary','',amount]),
    ...state.additions.map(item=>[`${item.month}-01`,item.note,'Added money','',item.amount]),
    ...state.expenses.map(e=>[e.date,e.note,e.category,e.payment,e.amount])
  ].sort((a,b)=>a[0].localeCompare(b[0]));
  const rows=[['Date','Description','Category','Payment mode','Amount (INR)'],...entries];
  const csv=rows.map(r=>r.map(v=>`"${csvSafe(v).replace(/"/g,'""')}"`).join(',')).join('\n');const blob=new Blob([`\uFEFF${csv}`],{type:'text/csv;charset=utf-8'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`kharcha-records-${new Date().toISOString().slice(0,10)}.csv`;a.click();URL.revokeObjectURL(a.href);showToast('CSV exported.');
}

$('expenseCategory').innerHTML=CATEGORIES.map(c=>`<option>${c.name}</option>`).join('');$('monthPicker').value=selectedMonth;
$('balanceVisibilityBtn').addEventListener('click',()=>{showBalance=!showBalance;render();});
$('salaryVisibilityBtn').addEventListener('click',()=>{showIncome=!showIncome;render();if($('addMoneyDialog').open)renderAddedMoneyHistory();});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&(showBalance||showIncome)){showBalance=false;showIncome=false;render();if($('addMoneyDialog').open)renderAddedMoneyHistory();}});
$('monthPicker').addEventListener('change',e=>{selectedMonth=e.target.value||currentMonthKey();showAllTransactions=false;render();});
['addExpenseBtn','mobileAddBtn'].forEach(id=>$(id).addEventListener('click',()=>openExpense()));
['voiceBtn','mobileVoiceBtn'].forEach(id=>$(id).addEventListener('click',startVoice));
$('salaryBtn').addEventListener('click',()=>{$('salaryInput').value=salaryFor(selectedMonth)||'';$('salaryDialog').showModal();setTimeout(()=>$('salaryInput').focus(),80);});
$('salaryForm').addEventListener('submit',e=>{e.preventDefault();state.salaries[selectedMonth]=Math.max(0,Number($('salaryInput').value)||0);saveState();$('salaryDialog').close();showToast(`Salary saved for ${monthLabel(selectedMonth)}.`);});
$('addMoneyBtn').addEventListener('click',openAddMoney);
$('addMoneyForm').addEventListener('submit',e=>{
  e.preventDefault();
  const amount=Number($('addMoneyAmount').value),note=$('addMoneyNote').value.trim();
  if(!Number.isFinite(amount)||amount<=0||!note)return;
  state.additions.push({id:crypto.randomUUID?.()||`${Date.now()}-${Math.random()}`,month:selectedMonth,amount:Math.round(amount*100)/100,note,createdAt:Date.now()});
  saveState();$('addMoneyDialog').close();showToast('Money added.');
});
$('addedMoneyHistory').addEventListener('click',e=>{
  const button=e.target.closest('[data-delete-addition]');
  if(!button||!confirm('Remove this added money?'))return;
  state.additions=state.additions.filter(item=>item.id!==button.dataset.deleteAddition);
  saveState();renderAddedMoneyHistory();showToast('Added money removed.');
});
$('expenseForm').addEventListener('submit',e=>{
  e.preventDefault();
  const amount=Number($('expenseAmount').value),note=$('expenseNote').value.trim();
  if(!Number.isFinite(amount)||amount<=0||!note)return;
  const details={amount:Math.round(amount*100)/100,note,category:$('expenseCategory').value,payment:$('expensePayment').value,date:$('expenseDate').value};
  if(editingExpenseId){
    const expense=state.expenses.find(item=>item.id===editingExpenseId);
    if(!expense){$('expenseDialog').close();showToast('This expense is no longer available.');return;}
    Object.assign(expense,details);
  }else{
    state.expenses.push({id:crypto.randomUUID?.()||`${Date.now()}-${Math.random()}`,createdAt:Date.now(),...details});
  }
  const wasEditing=!!editingExpenseId;
  saveState();$('expenseDialog').close();showToast(wasEditing?'Expense updated.':'Expense added.');
});
$('transactionList').addEventListener('click',e=>{
  const editButton=e.target.closest('[data-edit]');
  if(editButton){const expense=state.expenses.find(item=>item.id===editButton.dataset.edit);if(expense)openExpense(expense);return;}
  const deleteButton=e.target.closest('[data-delete]');
  if(!deleteButton)return;
  const id=deleteButton.dataset.delete;
  if(confirm('Delete this expense?')){state.expenses=state.expenses.filter(x=>x.id!==id);saveState();showToast('Expense deleted.');}
});
$('allTransactionsBtn').addEventListener('click',()=>{showAllTransactions=true;renderTransactions();});
['exportBtn','settingsExportBtn'].forEach(id=>$(id).addEventListener('click',exportCsv));
$('settingsBtn').addEventListener('click',()=>$('settingsDialog').showModal());document.querySelectorAll('[data-close]').forEach(btn=>btn.addEventListener('click',()=>{const target=btn.dataset.close; if(target==='settings')$('settingsDialog').close(); else document.getElementById(target)?.close();}));
$('syncStatusBtn').addEventListener('click',openAuthDialog);
$('gateSignInBtn').addEventListener('click',openAuthDialog);
$('authForm').addEventListener('submit',async e=>{e.preventDefault();if(!cloudApi){$('authError').textContent='Sign-in is unavailable right now.';return;}$('authError').textContent='';const email=$('authEmail').value.trim(),password=$('authPassword').value;try{await cloudApi.signIn(email,password);$('authPassword').value='';$('authDialog').close();showToast('Signed in. Records are syncing.');}catch(error){$('authError').textContent=authErrorMessage(error);}});
$('resetPasswordBtn').addEventListener('click',async()=>{
  const email=$('authEmail').value.trim();
  $('authError').textContent='';$('resetStatus').hidden=true;
  if(!email||!$('authEmail').checkValidity()){$('authError').textContent='Enter your email address first.';$('authEmail').focus();return;}
  if(!cloudApi){$('authError').textContent='Password reset is unavailable right now.';return;}
  const button=$('resetPasswordBtn');button.disabled=true;
  try{
    await cloudApi.requestPasswordReset(email);
    $('resetStatus').textContent='If an account exists for that email, a password reset link has been sent. Check your inbox and spam folder.';
    $('resetStatus').hidden=false;
    setTimeout(()=>{button.disabled=false;},60000);
  }catch(error){
    button.disabled=false;
    $('authError').textContent=error?.code?.includes('too-many-requests')?'Too many requests. Try again later.':'Could not send the reset email. Please try again later.';
  }
});
$('syncNowBtn').addEventListener('click',async()=>{if(!cloudApi||!cloudUser){$('authDialog').close();showToast('Sign in to sync your records.');return;}const saved=await cloudApi.syncNow();$('authDialog').close();showToast(saved?'Cloud sync refreshed.':'Cloud sync failed. Check your connection.');});
$('signOutBtn').addEventListener('click',async()=>{if(!cloudApi){$('authDialog').close();return;}try{await cloudApi.signOut();$('authDialog').close();showToast('Signed out. This device copy was removed.');}catch(error){$('authError').textContent=authErrorMessage(error);showToast(authErrorMessage(error));}});
$('clearDataBtn').addEventListener('click',()=>{if(confirm('Clear every salary, added money entry, and expense? Export first if you need a backup.')){state.salaries={};state.expenses=[];state.additions=[];saveState();$('settingsDialog').close();showToast('Device data cleared. Cloud sync is pending.');}});
document.querySelectorAll('.nav-item').forEach(a=>a.addEventListener('click',()=>{document.querySelectorAll('.nav-item').forEach(x=>x.classList.remove('active'));a.classList.add('active');}));
document.querySelectorAll('dialog').forEach(d=>d.addEventListener('click',e=>{if(e.target===d)d.close();}));
if('serviceWorker'in navigator){
  let controlledAtLoad=!!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange',()=>{
    if(controlledAtLoad)$('updateBanner').hidden=false;
    controlledAtLoad=true;
  });
  window.addEventListener('load',()=>navigator.serviceWorker.register('sw.js?v=13',{updateViaCache:'none'}).then(registration=>{
    registration.update().catch(()=>{});
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)registration.update().catch(()=>{});});
  }).catch(()=>{}));
}
$('reloadAppBtn').addEventListener('click',()=>location.reload());
initializeCloud();
