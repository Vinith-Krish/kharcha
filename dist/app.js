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
const state=loadState();
let selectedMonth=currentMonthKey();
let recognition=null;
let toastTimer;
let cloudApi=null;
let cloudUser=null;
let applyingCloudData=false;
let authMode='signin';

const $=id=>document.getElementById(id);
const money=n=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:Math.abs(n%1)>0?2:0}).format(Number(n)||0);
const monthLabel=key=>new Date(`${key}-02T00:00:00`).toLocaleDateString('en-IN',{month:'long',year:'numeric'});
const escapeHtml=s=>String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const isMonthKey=key=>/^\d{4}-(0[1-9]|1[0-2])$/.test(key||'');
const isIsoDate=value=>/^\d{4}-\d{2}-\d{2}$/.test(value||'')&&!Number.isNaN(new Date(`${value}T12:00:00`).getTime());
const csvSafe=value=>{const text=String(value??'');return /^[=+\-@\t]/.test(text)?`'${text}`:text;};

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
  return {salaries,expenses};
}

function loadState(){
  try{return normalizeState(JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}'));}catch{return {salaries:{},expenses:[]};}
}
function saveState(){localStorage.setItem(STORAGE_KEY,JSON.stringify(state));render();if(!applyingCloudData)cloudApi?.push(state);}
function salaryFor(key){return Number(state.salaries[key]||0);}
function monthExpenses(key){return state.expenses.filter(e=>e.date.startsWith(key));}
function totalFor(key){return monthExpenses(key).reduce((sum,e)=>sum+Number(e.amount),0);}
function previousMonth(key){const [y,m]=key.split('-').map(Number);const d=new Date(y,m-2,1);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;}
function carryFor(key,depth=0){
  if(depth>120)return 0;
  const prev=previousMonth(key);const hasPrev=Object.prototype.hasOwnProperty.call(state.salaries,prev)||monthExpenses(prev).length>0;
  if(!hasPrev)return 0;
  return Math.max(0,salaryFor(prev)+carryFor(prev,depth+1)-totalFor(prev));
}
function totals(){const salary=salaryFor(selectedMonth),carry=carryFor(selectedMonth),spent=totalFor(selectedMonth);return {salary,carry,spent,budget:salary+carry,available:salary+carry-spent};}

function render(){
  const t=totals();
  $('availableBalance').textContent=money(t.available);
  $('salaryValue').textContent=money(t.salary);
  $('carryValue').textContent=money(t.carry);
  $('spentLabel').textContent=`${money(t.spent)} spent`;
  $('remainingLabel').textContent=`${money(Math.max(0,t.available))} left`;
  const used=t.budget?Math.min(100,(t.spent/t.budget)*100):0;
  $('budgetProgress').style.width=`${used}%`;
  const status=$('balanceStatus');status.className='status-pill';
  if(!t.budget){status.textContent='Start here';$('balanceContext').textContent=`Set your salary for ${monthLabel(selectedMonth)} to begin.`;}
  else if(t.available<0){status.textContent='Over budget';status.classList.add('danger');$('balanceContext').textContent=`You have exceeded this month’s available amount by ${money(Math.abs(t.available))}.`;}
  else if(used>75){status.textContent='Watch spending';status.classList.add('warning');$('balanceContext').textContent=`${Math.round(used)}% of your available money has been used.`;}
  else{status.textContent='On track';$('balanceContext').textContent=`You have used ${Math.round(used)}% of ${money(t.budget)} available in ${monthLabel(selectedMonth)}.`;}
  renderCategories(t.spent);renderPayments(t.spent);renderTransactions();
}

function renderCategories(total){
  const grouped={};monthExpenses(selectedMonth).forEach(e=>grouped[e.category]=(grouped[e.category]||0)+Number(e.amount));
  const items=Object.entries(grouped).sort((a,b)=>b[1]-a[1]);
  $('categoryCount').textContent=`${items.length} categor${items.length===1?'y':'ies'}`;$('donutTotal').textContent=money(total);
  if(!items.length){$('categoryDonut').style.background='conic-gradient(#dfe6e1 0 100%)';$('categoryLegend').innerHTML='<p class="empty-mini">Your category mix will appear here.</p>';return;}
  let at=0;const stops=[];
  items.forEach(([name,value])=>{const cat=CATEGORIES.find(c=>c.name===name)||CATEGORIES.at(-1);const end=at+(value/total*100);stops.push(`${cat.color} ${at}% ${end}%`);at=end;});
  $('categoryDonut').style.background=`conic-gradient(${stops.join(',')})`;
  $('categoryLegend').innerHTML=items.slice(0,5).map(([name,value])=>{const cat=CATEGORIES.find(c=>c.name===name)||CATEGORIES.at(-1);return `<div class="legend-row"><i style="background:${cat.color}"></i><span>${escapeHtml(name)}<small>${Math.round(value/total*100)}% of spending</small></span><strong>${money(value)}</strong></div>`}).join('');
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

function renderTransactions(showAll=false){
  const expenses=monthExpenses(selectedMonth).sort((a,b)=>b.date.localeCompare(a.date)||b.createdAt-a.createdAt);
  const shown=showAll?expenses:expenses.slice(0,6);
  const allBtn=$('allTransactionsBtn');
  allBtn.hidden=showAll||expenses.length<=6;
  if(showAll||expenses.length<=6)allBtn.textContent='View all'; else allBtn.textContent=`View all (${expenses.length})`;
  if(!shown.length){$('transactionList').innerHTML='<div class="empty-state"><span>🧾</span><strong>No expenses yet</strong><p>Add your first expense manually or by voice.</p></div>';return;}
  $('transactionList').innerHTML=shown.map(e=>{const cat=CATEGORIES.find(c=>c.name===e.category)||CATEGORIES.at(-1);const date=new Date(`${e.date}T12:00:00`).toLocaleDateString('en-IN',{day:'numeric',month:'short'});return `<div class="transaction-row"><span class="transaction-icon">${cat.icon}</span><div class="transaction-main"><strong>${escapeHtml(e.note)}</strong><small>${escapeHtml(e.category)} · ${date}</small></div><div class="transaction-amount"><strong>− ${money(e.amount)}</strong><small>${escapeHtml(e.payment)}</small></div><button class="delete-btn" data-delete="${e.id}" aria-label="Delete ${escapeHtml(e.note)}">×</button></div>`}).join('');
}

function openExpense(prefill={}){
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
  cloudUser=user;$('signedInCard').hidden=!user;$('signedInActions').hidden=!user;$('authFields').hidden=!!user;$('signedOutActions').hidden=!!user;
  $('authHelp').hidden=!!user;$('authTitle').textContent=user?'Cloud sync is on':'Sign in to sync';$('signedInEmail').textContent=user?.email||'';
  const note=document.querySelector('.privacy-note p');
  if(note)note.textContent=user?'Your data stays on this device and in your private cloud account.':'Stored on this device. Sign in to sync privately across devices.';
}
function openAuthDialog(){
  $('authError').textContent='';updateAuthUi(cloudUser);$('authDialog').showModal();
  if(!cloudUser)setTimeout(()=>$('authEmail').focus(),80);
}
function setAuthMode(mode){
  authMode=mode;const creating=mode==='signup';$('authTitle').textContent=creating?'Create your sync account':'Sign in to sync';
  $('authSwitchBtn').textContent=creating?'I already have an account':'Create account';$('signedOutActions').querySelector('.primary-btn').textContent=creating?'Create & sync':'Sign in';
  $('authPassword').autocomplete=creating?'new-password':'current-password';$('authError').textContent='';
}
function authErrorMessage(error){
  const code=error?.code||'';if(code.includes('invalid-credential'))return'Incorrect email or password.';if(code.includes('email-already-in-use'))return'An account already exists for this email.';if(code.includes('weak-password'))return'Use a password with at least 6 characters.';if(code.includes('operation-not-allowed'))return'Email sign-in is still being enabled. Please try again shortly.';return error?.message?.replace(/^Firebase:\s*/,'')||'Could not sign in.';
}
async function initializeCloud(){
  setSyncStatus('syncing');
  try{
    const {createCloudSync}=await import('./sync.js');
    cloudApi=await createCloudSync({
      getLocalData:()=>({salaries:state.salaries,expenses:state.expenses}),
      onData:data=>{const next=normalizeState(data);applyingCloudData=true;state.salaries=next.salaries;state.expenses=next.expenses;localStorage.setItem(STORAGE_KEY,JSON.stringify(state));render();applyingCloudData=false;},
      onUser:user=>updateAuthUi(user),
      onStatus:setSyncStatus
    });
  }catch(error){setSyncStatus('error','Cloud sync is temporarily unavailable. Your device copy is safe.');console.error(error);}
}
function exportCsv(){
  if(!state.expenses.length){showToast('There are no expenses to export yet.');return;}
  const rows=[['Date','Description','Category','Payment mode','Amount (INR)'],...state.expenses.sort((a,b)=>a.date.localeCompare(b.date)).map(e=>[e.date,e.note,e.category,e.payment,e.amount])];
  const csv=rows.map(r=>r.map(v=>`"${csvSafe(v).replace(/"/g,'""')}"`).join(',')).join('\n');const blob=new Blob([`\uFEFF${csv}`],{type:'text/csv;charset=utf-8'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`kharcha-expenses-${new Date().toISOString().slice(0,10)}.csv`;a.click();URL.revokeObjectURL(a.href);showToast('CSV exported.');
}

$('expenseCategory').innerHTML=CATEGORIES.map(c=>`<option>${c.name}</option>`).join('');$('monthPicker').value=selectedMonth;
$('monthPicker').addEventListener('change',e=>{selectedMonth=e.target.value||currentMonthKey();render();});
['addExpenseBtn','mobileAddBtn'].forEach(id=>$(id).addEventListener('click',()=>openExpense()));
['voiceBtn','mobileVoiceBtn'].forEach(id=>$(id).addEventListener('click',startVoice));
$('salaryBtn').addEventListener('click',()=>{$('salaryInput').value=salaryFor(selectedMonth)||'';$('salaryDialog').showModal();setTimeout(()=>$('salaryInput').focus(),80);});
$('salaryForm').addEventListener('submit',e=>{e.preventDefault();state.salaries[selectedMonth]=Math.max(0,Number($('salaryInput').value)||0);saveState();$('salaryDialog').close();showToast(`Salary saved for ${monthLabel(selectedMonth)}.`);});
$('expenseForm').addEventListener('submit',e=>{e.preventDefault();const amount=Number($('expenseAmount').value);if(!amount||amount<=0)return;state.expenses.push({id:crypto.randomUUID?.()||`${Date.now()}-${Math.random()}`,amount,note:$('expenseNote').value.trim(),category:$('expenseCategory').value,payment:$('expensePayment').value,date:$('expenseDate').value,createdAt:Date.now()});saveState();$('expenseDialog').close();showToast('Expense added.');});
$('transactionList').addEventListener('click',e=>{const id=e.target.dataset.delete;if(!id)return;if(confirm('Delete this expense?')){state.expenses=state.expenses.filter(x=>x.id!==id);saveState();showToast('Expense deleted.');}});
$('allTransactionsBtn').addEventListener('click',()=>{renderTransactions(true);$('allTransactionsBtn').hidden=true;});
['exportBtn','settingsExportBtn'].forEach(id=>$(id).addEventListener('click',exportCsv));
$('settingsBtn').addEventListener('click',()=>$('settingsDialog').showModal());document.querySelectorAll('[data-close]').forEach(btn=>btn.addEventListener('click',()=>{const target=btn.dataset.close; if(target==='settings')$('settingsDialog').close(); else document.getElementById(target)?.close();}));
$('syncStatusBtn').addEventListener('click',openAuthDialog);
$('authSwitchBtn').addEventListener('click',()=>setAuthMode(authMode==='signin'?'signup':'signin'));
$('authForm').addEventListener('submit',async e=>{e.preventDefault();if(!cloudApi){$('authError').textContent='Cloud sync is unavailable right now. Your device copy remains saved.';return;}$('authError').textContent='';const email=$('authEmail').value.trim(),password=$('authPassword').value;try{if(authMode==='signup')await cloudApi.signUp(email,password);else await cloudApi.signIn(email,password);$('authDialog').close();showToast(authMode==='signup'?'Account created. Your device records are syncing.':'Signed in. Records are syncing.');}catch(error){$('authError').textContent=authErrorMessage(error);}});
$('syncNowBtn').addEventListener('click',async()=>{if(!cloudApi||!cloudUser){$('authDialog').close();showToast('Sign in to sync your records.');return;}await cloudApi.syncNow();$('authDialog').close();showToast('Cloud sync refreshed.');});
$('signOutBtn').addEventListener('click',async()=>{if(!cloudApi){$('authDialog').close();return;}await cloudApi.signOut();$('authDialog').close();showToast('Signed out. Records remain saved on this device.');});
$('clearDataBtn').addEventListener('click',()=>{const msg=cloudUser?'Clear every salary and expense from this device and your signed-in cloud sync? Export first if you need a backup.':'Clear every salary and expense from this device? Export first if you need a backup.';if(confirm(msg)){state.salaries={};state.expenses=[];saveState();$('settingsDialog').close();showToast(cloudUser?'All data cleared from this device and cloud sync.':'All local data cleared.');}});
document.querySelectorAll('.nav-item').forEach(a=>a.addEventListener('click',()=>{document.querySelectorAll('.nav-item').forEach(x=>x.classList.remove('active'));a.classList.add('active');}));
document.querySelectorAll('dialog').forEach(d=>d.addEventListener('click',e=>{if(e.target===d)d.close();}));
if('serviceWorker'in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('sw.js').catch(()=>{}));
render();
initializeCloud();
