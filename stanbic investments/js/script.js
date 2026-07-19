/* ===========================
   CHECK IF LOGGED IN
=========================== */
// Note: Index.html is the public landing page - no redirects from here
// Redirect logic is handled on individual protected pages (login.html, dashboard.html, etc.)

/* ===========================
   MOBILE MENU
=========================== */
const toggle = document.querySelector(".menu-toggle");
const nav = document.querySelector(".nav-links");
toggle?.addEventListener("click",()=>nav.classList.toggle("show"));
const currentUser = JSON.parse(localStorage.getItem("currentUser") || "null");

/* ===========================
   MODAL / MULTI-STEP FORM
=========================== */
const modal = document.getElementById("modal");
const openBtns = document.querySelectorAll(".open-modal");
const closeBtn = document.querySelector(".close");
function logActivity(entry){
  try{
    const logs = JSON.parse(localStorage.getItem('activityLog')||'[]');
    logs.unshift({ ...entry, ts: new Date().toISOString() });
    localStorage.setItem('activityLog', JSON.stringify(logs));
  }catch(e){ console.error('activity log failed', e); }
}

openBtns.forEach(btn=>btn.addEventListener("click",()=>{
  if (!modal) return;
  modal.style.display="flex";
  logActivity({type:'open_registration_modal', label: btn.textContent || btn.className || 'open-modal'});
}));
closeBtn?.addEventListener("click",()=>{ if (modal) modal.style.display="none"; });
window.addEventListener("click",(e)=>{ if(modal && e.target==modal) modal.style.display="none"; });

/* ===========================
   REGISTER BUTTON LOGIC
=========================== */
const registerTopBtn = document.getElementById("register-top-btn");
const registerAfterAboutBtn = document.getElementById("register-after-about-btn");

function handleRegisterClick() {
  // Always open the registration modal when register is clicked
  if (!modal) return;
  modal.style.display = "flex";
}

registerTopBtn?.addEventListener("click", handleRegisterClick);
registerAfterAboutBtn?.addEventListener("click", handleRegisterClick);

/* ===========================
   MULTI-STEP FORM LOGIC
=========================== */
let currentStep = 0;
const steps = document.querySelectorAll(".step");
const stepLabels = document.querySelectorAll(".step-label");
const form = document.getElementById("multi-step-form");
const DOCUMENTS_STORAGE_KEY = "uploadedDocuments";

function getStorageArray(key) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key));
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error(`Failed to parse localStorage key "${key}"`, err);
    return [];
  }
}

function setStorageArray(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function showStep(step){
  steps.forEach((el,i)=>el.style.display=i===step?"block":"none");
  stepLabels.forEach((label,i)=>label.classList.toggle("active",i===step));
}
showStep(currentStep);

// OTP timer
let otpTimerInterval;
function startOtpTimer(){
  let timeLeft=60;
  const otpTimer=document.getElementById("otp-timer");
  const nextBtn=steps[3].querySelector(".next-btn");
  nextBtn.disabled=false;
  clearInterval(otpTimerInterval);
  otpTimerInterval=setInterval(()=>{
    timeLeft--;
    otpTimer.innerText=timeLeft;
    if(timeLeft<=0){ clearInterval(otpTimerInterval); nextBtn.disabled=true; alert("OTP expired! Click Send OTP again."); }
  },1000);
}

// NEXT buttons
form.querySelectorAll(".next-btn").forEach(btn=>{
  btn.addEventListener("click",()=>{
    // STEP 0: Personal
    if(currentStep===0){
      const fn=document.getElementById("first-name").value.trim();
      const ln=document.getElementById("last-name").value.trim();
      const po=document.getElementById("po-box").value.trim();
      const st=document.getElementById("street-address").value.trim();
      if(!fn||!ln||!po||!st){ alert("Fill all personal details"); return; }
      currentStep++; showStep(currentStep); return;
    }

    // STEP 1: Email
    if(currentStep===1){
      const email=document.getElementById("email").value.trim();
      if(!email){ alert("Enter email"); return; }
      currentStep++; showStep(currentStep); return;
    }

    // STEP 2: Phone
    if(currentStep===2){
      const phone=document.getElementById("phone").value.trim();
      if(!phone){ alert("Enter phone"); return; }
      const masked=phone.slice(0,4)+" ****"+phone.slice(-4);
      document.getElementById("masked-phone").innerText=masked;
      currentStep++; showStep(currentStep); startOtpTimer(); return;
    }

    // STEP 3: Verify OTP
    if(currentStep===3){
      const otp=document.getElementById("otp").value.trim();
      if(otp.length!==6){ alert("Enter 6-digit OTP"); return; }
      currentStep++; showStep(currentStep); return;
    }

    // STEP 4: Passcode
    if(currentStep===4){
      const pass=document.getElementById("passcode").value.trim();
      if(!pass){ alert("Enter passcode"); return; }
      currentStep++; showStep(currentStep); return;
    }
  });
});

// PREV buttons
form.querySelectorAll(".prev-btn").forEach(btn=>{
  btn.addEventListener("click",()=>{
    if(currentStep>0){ currentStep--; showStep(currentStep); }
  });
});

// SUBMIT FORM
form.onsubmit=async (e)=>{
  e.preventDefault();
  const passportFile=document.getElementById("passport-photo").files[0];
  if(!passportFile){ alert("Upload passport photo"); return; }
  if(!passportFile.type.startsWith("image/")){ alert("Passport photo must be an image"); return; }

  const firstName=document.getElementById("first-name").value.trim();
  const lastName=document.getElementById("last-name").value.trim();
  const poBox=document.getElementById("po-box").value.trim();
  const street=document.getElementById("street-address").value.trim();
  const email=document.getElementById("email").value.trim();
  const phone=document.getElementById("phone").value.trim();
  const passcode=document.getElementById("passcode").value.trim();

  if(!firstName||!lastName||!poBox||!street||!email||!phone||!passcode){ alert("All fields required"); return; }

  let users=JSON.parse(localStorage.getItem("users"))||[];
  if(users.some(u=>u.email===email||u.phone===phone)){ alert("User exists"); return; }

  // Convert passport photo to base64
  const passportPhoto = await new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(passportFile);
  });

  const newUser={
    id:`USR-${Math.random().toString(36).slice(2, 11).toUpperCase()}`,
    firstName,
    lastName,
    poBox,
    street,
    email,
    phone,
    passcode,
    passportPhoto,
    balance:0,
    assets:{BTC:0,ETH:0,SOL:0,TRX:0,USDT:0},
    transactions:[],
    hasPaidBlockchainFee:false,
    active:true,
    createdAt:new Date().toISOString()
  };
  users.push(newUser);
  localStorage.setItem("users",JSON.stringify(users));

  // Log activity for admin monitoring
  try{
    const logs = JSON.parse(localStorage.getItem('activityLog')||'[]');
    logs.unshift({ type: 'user_registered', userEmail: newUser.email, userId: newUser.id, ts: new Date().toISOString() });
    localStorage.setItem('activityLog', JSON.stringify(logs));
  }catch(e){ console.error('activityLog save failed', e); }

  const documents = getStorageArray(DOCUMENTS_STORAGE_KEY);
  documents.unshift({
    id: `DOC-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
    uploadedAt: new Date().toISOString(),
    userId: newUser.id,
    userName: `${firstName} ${lastName}`,
    userEmail: email,
    fileName: passportFile.name || "passport-photo",
    documentType: "passport-photo",
    fileMime: passportFile.type || "image/*",
    fileData: passportPhoto
  });
  setStorageArray(DOCUMENTS_STORAGE_KEY, documents);

  document.getElementById("form-success").style.display="block";
  setTimeout(()=>{ modal.style.display="none"; window.location.href="login.html"; },1500);
};

/* ===========================
   ASSET / DEPOSIT BUTTONS
=========================== */
document.querySelectorAll(".buy-btn").forEach(btn=>btn.addEventListener("click",()=>{
  alert("Please register or log in first."); modal.style.display="flex";
}));
document.querySelector(".deposit-btn")?.addEventListener("click",()=>{ alert("Please register or log in first."); modal.style.display="flex"; });

/* ===========================
   LOAD MORE NEWS
=========================== */
const loadBtn=document.getElementById("load-more");
loadBtn?.addEventListener("click",()=>{
  document.querySelectorAll(".news-item.hidden").forEach(el=>el.classList.remove("hidden"));
  loadBtn.style.display="none";
});

/* ===========================
   HERO TEXT ANIMATION
=========================== */
const heroText=document.getElementById("hero-text");
let heroPos=0,heroDir=1;
function animateHeroText(){ heroPos+=heroDir; if(heroPos>50||heroPos<0) heroDir*=-1; heroText.style.transform=`translateX(${heroPos}px)`; requestAnimationFrame(animateHeroText); }
animateHeroText();

/* ===========================
   HERO ICONS ANIMATION
=========================== */
document.querySelectorAll(".hero-icon").forEach(icon=>{
  let posY=0;
  function floatIcon(){ posY-=0.2; if(posY<-600) posY=0; icon.style.transform=`translateY(${posY}px)`; requestAnimationFrame(floatIcon); }
  floatIcon();
});

/* ===========================
   SCROLLING FOOTER BANNER
=========================== */
const banner=document.querySelector(".scrolling-banner");
let bannerPos=0;
function animateBanner(){ bannerPos-=1; if(bannerPos<-banner.scrollWidth) bannerPos=window.innerWidth; banner.style.transform=`translateX(${bannerPos}px)`; requestAnimationFrame(animateBanner); }
animateBanner();

/* ===========================
   LIVE CHAT
=========================== */
const chatPanel=document.getElementById("live-chat");
const chatToggle=document.getElementById("chat-toggle");
const chatBody=document.getElementById("chat-body");
const chatInput=document.getElementById("chat-input");
const sendChatBtn=document.getElementById("send-chat");
const closeChat=document.getElementById("close-chat");

chatToggle?.addEventListener("click",()=>chatPanel.style.display="flex");
closeChat?.addEventListener("click",()=>chatPanel.style.display="none");

sendChatBtn?.addEventListener("click",()=>{
  const msg=chatInput.value.trim();
  if(!msg) return;
  
  // Store user message
  const guestId = localStorage.getItem('guest_chat_id') || `guest_${Date.now()}`;
  localStorage.setItem('guest_chat_id', guestId);
  
  const userMessage = {
    sender: 'user',
    message: msg,
    timestamp: new Date().toLocaleString(),
    guestId: guestId
  };
  
  let conversations = JSON.parse(localStorage.getItem(`chat_conversations_guest_${guestId}`)) || [];
  conversations.push(userMessage);
  localStorage.setItem(`chat_conversations_guest_${guestId}`, JSON.stringify(conversations));
  
  const userMsg=document.createElement("div"); userMsg.className="chat-msg user-msg"; userMsg.innerText=msg; chatBody.appendChild(userMsg); chatInput.value="";
  
  setTimeout(()=>{
    const botResponse = (msg.toLowerCase().includes("agent")||msg.toLowerCase().includes("human"))?"Connecting you to a live agent...":"Hello! How can I assist you? You can ask for 'agent' to chat with a human.";
    
    // Store bot response
    const botMessage = {
      sender: 'bot',
      message: botResponse,
      timestamp: new Date().toLocaleString(),
      guestId: guestId
    };
    conversations.push(botMessage);
    localStorage.setItem(`chat_conversations_guest_${guestId}`, JSON.stringify(conversations));
    
    const botMsg=document.createElement("div"); botMsg.className="chat-msg bot-msg";
    botMsg.innerText=botResponse; chatBody.appendChild(botMsg); chatBody.scrollTop=chatBody.scrollHeight;
  },800);
});

/* ===========================
   SMOOTH SCROLL
=========================== */
document.querySelectorAll("a[href^='#']").forEach(anchor=>{
  anchor.addEventListener("click",function(e){ e.preventDefault(); document.querySelector(this.getAttribute("href")).scrollIntoView({behavior:"smooth"}); });
});

/* ===========================
   PERSONALIZED WELCOME
=========================== */
function setWelcomeName(fullName){ const firstName=fullName.split(" ")[0]; const el=document.getElementById("user-name"); if(el) el.textContent=firstName; }

/* ===========================
   CRYPTO TRADING LOGIC
=========================== */
function updateBalance(){
  const balanceEl = document.getElementById("user-balance");
  if(currentUser && balanceEl) balanceEl.textContent=Number(currentUser.balance || 0).toFixed(2);
}
function addTransaction(desc,amt){
  if(currentUser){
    currentUser.transactions = Array.isArray(currentUser.transactions) ? currentUser.transactions : [];
    currentUser.transactions.push({desc,amt,date:new Date().toISOString()});
    localStorage.setItem("currentUser",JSON.stringify(currentUser));
  }
}

document.querySelectorAll(".trade-card").forEach(card=>{
  const asset=card.dataset.asset;
  const buyBtn=card.querySelector(".buy-crypto");
  const sellBtn=card.querySelector(".sell-crypto");
  const amountInput=card.querySelector(".trade-amount");

  buyBtn?.addEventListener("click",()=>{
    if(!currentUser){ alert("Please register or log in first."); return; }
    const amt=parseFloat(amountInput.value);
    if(amt>0 && currentUser.balance>=amt){ currentUser.balance-=amt; updateBalance(); addTransaction(`Buy ${asset}`,amt); alert(`Bought ${asset} for ${amt} KES`); amountInput.value=""; }
    else alert("Enter valid amount and ensure sufficient balance");
  });

  sellBtn?.addEventListener("click",()=>{
    if(!currentUser){ alert("Please register or log in first."); return; }
    const amt=parseFloat(amountInput.value);
    if(amt>0){ currentUser.balance+=amt; updateBalance(); addTransaction(`Sell ${asset}`,amt); alert(`Sold ${asset} for ${amt} KES`); amountInput.value=""; }
    else alert("Enter valid amount");
  });
});

// Initialize welcome and balance
if(currentUser){ setWelcomeName(currentUser.firstName+" "+currentUser.lastName); updateBalance(); }
