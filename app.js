// Kameti Club State and Logic
class KametiApp {
  constructor() {
    this.users = [];
    this.groups = [];
    this.transactions = [];
    this.chats = {};
    this.urgentRequests = [];
    this.currentUser = null;
    this.tempRegisterData = null; // Holds register data before OTP verify
    
    // UI Navigation State
    this.currentView = 'home';
    this.activeUserPane = 'user-overview';
    this.activeAdminPane = 'admin-overview';
    this.activeAdminChatUser = null;
    
    this.init();
  }

  init() {
    // Load data from LocalStorage
    this.loadData();

    // Check if the loaded data has old groups format (e.g. grp_silver_1 instead of grp_silver_1_batch_1)
    const hasOldFormat = this.groups.length > 0 && this.groups.some(g => !g.id.includes('batch'));
    const isMissingProdAdmin = !this.users.some(u => u.email === 'faheemkhan101992@gmail.com');

    // If local storage is empty, has old format, or is missing the production admin, clear and seed clean database
    if (hasOldFormat || isMissingProdAdmin || this.users.length === 0) {
      localStorage.clear();
      this.users = [];
      this.groups = [];
      this.transactions = [];
      this.chats = {};
      this.urgentRequests = [];
      
      this.seedData();
      this.saveData();
    }

    // Set up navbar clock
    this.startClock();

    // Setup drag-and-drop or simple click previews
    this.setupUploadHandlers();

    // Render dynamic recruiting groups on landing page
    this.renderPublicGroups();

    // Sync storage updates across open tabs/windows in real-time
    window.addEventListener('storage', () => {
      this.loadData();
      this.renderPublicGroups();
      if (this.currentUser) {
        if (this.currentView === 'user-dashboard') {
          if (this.activeUserPane === 'user-overview') this.renderUserOverview();
          if (this.activeUserPane === 'user-kametis') this.renderUserKametis();
          if (this.activeUserPane === 'user-payments') this.renderUserPayments();
        } else if (this.currentView === 'admin-dashboard') {
          if (this.activeAdminPane === 'admin-overview') this.renderAdminOverview();
          if (this.activeAdminPane === 'admin-groups') this.renderAdminGroups();
        }
      }
    });

    // Retrieve active session if any
    const savedSession = sessionStorage.getItem('Kameti_session');
    if (savedSession) {
      const sessionUser = JSON.parse(savedSession);
      // Refresh user object from database
      this.currentUser = this.users.find(u => u.email === sessionUser.email);
      if (this.currentUser) {
        if (this.currentUser.role === 'admin') {
          this.navigateTo('admin-dashboard');
        } else {
          this.navigateTo('user-dashboard');
        }
      }
    } else {
      this.navigateTo('home');
    }

    // Load API keys in view elements
    document.getElementById('keyGemini').value = localStorage.getItem('key_gemini') || '';
    document.getElementById('keyGroq').value = localStorage.getItem('key_groq') || '';

    // Log visitor statistics
    this.logVisitorVisit();
  }

  logVisitorVisit() {
    fetch('/api/log-visit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    })
    .catch(err => {
      console.error("Failed to post visitor log details:", err);
    });
  }

  // --- Clock ---
  startClock() {
    const clockEl = document.getElementById('navClock');
    const updateTime = () => {
      let now;
      if (this.simulatedTime) {
        // Increment simulated time by 1 second each tick
        this.simulatedTime = new Date(this.simulatedTime.getTime() + 1000);
        now = this.simulatedTime;
        
        // Check triggers on tick
        this.checkTimeBasedTriggersTick(now);
      } else {
        now = new Date();
      }
      
      const yyyy = now.getFullYear();
      const mm = String(now.getMonth() + 1).padStart(2, '0');
      const dd = String(now.getDate()).padStart(2, '0');
      const hh = String(now.getHours()).padStart(2, '0');
      const min = String(now.getMinutes()).padStart(2, '0');
      const sec = String(now.getSeconds()).padStart(2, '0');
      clockEl.innerText = `${yyyy}-${mm}-${dd} ${hh}:${min}:${sec} ${this.simulatedTime ? '(SIMULATED)' : ''}`;
    };
    updateTime();
    setInterval(updateTime, 1000);
  }

  // --- LocalStorage Ops ---
  loadData() {
    this.users = JSON.parse(localStorage.getItem('Kameti_users') || '[]');
    this.groups = JSON.parse(localStorage.getItem('Kameti_groups') || '[]');
    this.transactions = JSON.parse(localStorage.getItem('Kameti_transactions') || '[]');
    this.chats = JSON.parse(localStorage.getItem('Kameti_chats') || '{}');
    this.urgentRequests = JSON.parse(localStorage.getItem('Kameti_urgent') || '[]');
    this.reminderLogs = JSON.parse(localStorage.getItem('Kameti_reminder_logs') || '{}');
  }

  saveData() {
    localStorage.setItem('Kameti_users', JSON.stringify(this.users));
    localStorage.setItem('Kameti_groups', JSON.stringify(this.groups));
    localStorage.setItem('Kameti_transactions', JSON.stringify(this.transactions));
    localStorage.setItem('Kameti_chats', JSON.stringify(this.chats));
    localStorage.setItem('Kameti_urgent', JSON.stringify(this.urgentRequests));
    localStorage.setItem('Kameti_reminder_logs', JSON.stringify(this.reminderLogs));
  }

  getGroupMonthName(group, monthIdx) {
    if (!group) return `Month ${monthIdx}`;
    
    let baseDate;
    if (group.startDate) {
      // Split date to avoid timezone offsets parsing issues
      const parts = group.startDate.split('-');
      baseDate = new Date(parts[0], parts[1] - 1, parts[2] || 10);
    } else {
      // Fallback: If not started, use current date or simulated time
      baseDate = this.simulatedTime ? new Date(this.simulatedTime) : new Date();
    }
    
    // Calculate the target month by shifting months
    const d = new Date(baseDate.getFullYear(), baseDate.getMonth() + (monthIdx - 1), 10);
    const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    return `${months[d.getMonth()]} ${d.getFullYear()}`;
  }

  updatePaymentMonthsSelector(groupId) {
    const monthSelector = document.getElementById('payMonthSelector');
    if (!monthSelector) return;
    monthSelector.innerHTML = '';
    
    const group = this.groups.find(g => g.id === groupId);
    if (!group) {
      monthSelector.innerHTML = '<option value="" disabled selected>Select Group First</option>';
      return;
    }
    
    for (let m = 1; m <= 10; m++) {
      const monthName = this.getGroupMonthName(group, m);
      monthSelector.innerHTML += `<option value="${monthName}">${monthName}</option>`;
    }
    
    // Auto-select the current cycle month name
    const currentMonthName = this.getGroupMonthName(group, group.cycleMonth);
    monthSelector.value = currentMonthName;
    this.updatePaymentCalculator();
  }

  renderPublicGroups() {
    // Dynamically calculate and render landing page statistics from actual data (no fake claims)
    const statsUsersEl = document.getElementById('landingStatsUsers');
    const statsGroupsEl = document.getElementById('landingStatsGroups');
    const statsDisbursedEl = document.getElementById('landingStatsDisbursed');
    
    if (statsUsersEl) {
      const activeSaversCount = this.users.filter(u => u.role !== 'admin').length;
      statsUsersEl.innerText = `${activeSaversCount} Verified Members`;
    }
    if (statsGroupsEl) {
      const runningGroupsCount = this.groups.filter(g => g.status === 'running').length;
      statsGroupsEl.innerText = `${runningGroupsCount} saving pools`;
    }
    if (statsDisbursedEl) {
      const disbursedAmount = this.transactions
        .filter(t => t.type === 'payout')
        .reduce((sum, t) => sum + t.amount, 0);
      statsDisbursedEl.innerText = `Rs. ${disbursedAmount.toLocaleString()}`;
    }

    const listEl = document.getElementById('publicGroupsList');
    if (!listEl) return;
    listEl.innerHTML = '';
    
    // Filter waiting groups (recruiting)
    const waitingGroups = this.groups.filter(g => g.status === 'waiting');
    
    if (waitingGroups.length === 0) {
      listEl.innerHTML = '<div style="font-size: 0.85rem; color: var(--text-muted); text-align: center; padding: 2rem; border: 1.5px dashed rgba(0, 0, 0, 0.05); border-radius: 12px; grid-column: 1 / -1;">All groups currently active. New batches starting soon!</div>';
      return;
    }
    
    waitingGroups.forEach(g => {
      const joined = g.members.length;
      const needed = 10 - joined;
      const progress = (joined / 10) * 100;
      
      listEl.innerHTML += `
        <div class="group-card animate-scale-in" style="min-height: 280px; display: flex; flex-direction: column; justify-content: space-between;">
          <div>
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem; width: 100%;">
              <span class="group-tag-inline">Rs. ${(g.amount).toLocaleString()} Payout</span>
              <span class="badge badge-warning" style="font-size: 0.72rem; font-weight: bold; padding: 0.15rem 0.5rem; text-transform: uppercase;">Recruiting</span>
            </div>
            <h3 class="group-title">${g.name}</h3>
            <div class="group-size">${joined}/10 Members Joined</div>
            
            <div class="progress-bar-wrapper">
              <div class="progress-bar" style="width: ${progress}%;"></div>
            </div>

            <div class="group-details" style="margin-top: 1.25rem;">
              <div class="detail-row">
                <span class="label">Monthly Deposit:</span>
                <span class="val">Rs. ${g.monthlyPayment.toLocaleString()}</span>
              </div>
              <div class="detail-row">
                <span class="label">Total Kameti Value:</span>
                <span class="val" style="color: var(--primary); font-weight: 700;">Rs. ${g.amount.toLocaleString()}</span>
              </div>
              <div class="detail-row">
                <span class="label">Seats Available:</span>
                <span class="val" style="color: var(--accent); font-weight: bold;">${needed} seats left</span>
              </div>
            </div>
          </div>
          
          <div style="margin-top: 0.5rem;">
            <button class="btn btn-primary" style="width: 100%;" onclick="app.handlePublicJoin('${g.id}')">
              <i class="fa-solid fa-right-to-bracket"></i> Join Kameti Group
            </button>
          </div>
        </div>
      `;
    });
  }

  handlePublicJoin(groupId) {
    if (!this.currentUser) {
      this.showToast('Please register an account to join the kameti group!', 'info');
      this.navigateTo('register');
      return;
    }
    
    // If logged in, join the group
    this.joinGroup(groupId);
  }

  // --- Seeder ---
  seedData() {
    // 1. Setup Production Admin Account
    this.users.push({
      name: 'Faheem Khan',
      email: 'faheemkhan101992@gmail.com',
      whatsapp: '03001234567',
      role: 'admin',
      password: 'faheem12341234',
      status: 'approved',
      payoutMethod: 'Bank',
      bankName: 'Meezan Bank',
      accTitle: 'Faheem Khan',
      accNumber: '0102030405060',
      accIban: 'PK55MEZN0102030405060',
      cnicFront: 'placeholder_cnic_front',
      cnicBack: 'placeholder_cnic_back',
      joinedDate: new Date().toISOString().split('T')[0]
    });

    // 2. Setup Tiers Groups
    // Micro Savings (20,000 PKR, Monthly: 2,000 PKR) - Batch 1
    this.groups.push({
      id: 'grp_micro_1_batch_1',
      name: 'Micro Saver Group - Batch 1',
      amount: 20000,
      monthlyPayment: 2000,
      members: [],
      status: 'waiting',
      cycleMonth: 1,
      rotation: [],
      startDate: null,
      batch: 1
    });

    // Silver Kameti (50,000 PKR, Monthly: 5,000 PKR) - Batch 1
    this.groups.push({
      id: 'grp_silver_1_batch_1',
      name: 'Silver Starter Pool - Batch 1',
      amount: 50000,
      monthlyPayment: 5000,
      members: [],
      status: 'waiting',
      cycleMonth: 1,
      rotation: [],
      startDate: null,
      batch: 1
    });

    // Gold Kameti (100,000 PKR, Monthly: 10,000 PKR) - Batch 1
    this.groups.push({
      id: 'grp_gold_1_batch_1',
      name: 'Gold Wealth Builder - Batch 1',
      amount: 100000,
      monthlyPayment: 10000,
      members: [],
      status: 'waiting',
      cycleMonth: 1,
      rotation: [],
      startDate: null,
      batch: 1
    });

    // Diamond Kameti (150,000 PKR, Monthly: 15,000 PKR) - Batch 1
    this.groups.push({
      id: 'grp_diamond_1_batch_1',
      name: 'Diamond Premium Circle - Batch 1',
      amount: 150000,
      monthlyPayment: 15000,
      members: [],
      status: 'waiting',
      cycleMonth: 1,
      rotation: [],
      startDate: null,
      batch: 1
    });

    // Platinum Kameti (200,000 PKR, Monthly: 20,000 PKR) - Batch 1
    this.groups.push({
      id: 'grp_platinum_1_batch_1',
      name: 'Platinum Premium Pool - Batch 1',
      amount: 200000,
      monthlyPayment: 20000,
      members: [],
      status: 'waiting',
      cycleMonth: 1,
      rotation: [],
      startDate: null,
      batch: 1
    });
  }

  // --- Router ---
  navigateTo(viewId) {
    this.currentView = viewId;
    
    // Deactivate all sections
    const sections = document.querySelectorAll('.view-section');
    sections.forEach(s => s.classList.remove('active'));

    // Activate the specified section
    const targetSection = document.getElementById(`view-${viewId}`);
    if (targetSection) {
      targetSection.classList.add('active');
    }

    // Update Nav Actions based on Auth Status
    this.updateNavbar();

    // Trigger specific views initializers
    if (viewId === 'home') {
      this.renderPublicGroups();
    } else if (viewId === 'user-dashboard') {
      this.renderUserDashboard();
    } else if (viewId === 'admin-dashboard') {
      this.renderAdminDashboard();
    }
  }

  updateNavbar() {
    const menuEl = document.getElementById('navMenu');
    if (this.currentUser) {
      menuEl.innerHTML = `
        <span style="align-self: center; font-size: 0.9rem; font-weight: 600; color: var(--text-main);">
          Hello, <span style="color: var(--primary);">${this.currentUser.name}</span>
        </span>
        <button class="btn btn-outline btn-ghost" onclick="app.navigateTo('${this.currentUser.role === 'admin' ? 'admin' : 'user'}-dashboard')">Dashboard</button>
        <button class="btn btn-primary" onclick="app.handleLogout()">Logout</button>
      `;
    } else {
      menuEl.innerHTML = `
        <button class="btn btn-ghost" onclick="app.navigateTo('home')">Home</button>
        <button class="btn btn-outline" onclick="app.navigateTo('login')">Login</button>
        <button class="btn btn-primary" onclick="app.navigateTo('register')">Get Started</button>
      `;
    }
  }

  // --- Auth Handlers ---
  handleCNICUpload(event, side) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const previewImg = document.getElementById(`cnic${side === 'front' ? 'Front' : 'Back'}Preview`);
      previewImg.src = e.target.result;
      previewImg.style.display = 'block';
      
      // Save data base64 into app temp register files
      if (!this.tempRegisterData) {
        this.tempRegisterData = {};
      }
      this.tempRegisterData[`cnic_${side}`] = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  toggleBankDropdown(value) {
    const bankSelectGroup = document.getElementById('bankSelectGroup');
    const bankNameInput = document.getElementById('bankName');
    const accTitleInput = document.getElementById('accTitle');
    const accNumInput = document.getElementById('accNumber');
    
    if (value === 'Bank') {
      bankSelectGroup.style.display = 'flex';
      bankNameInput.setAttribute('required', 'true');
      accTitleInput.placeholder = 'Ali Khan';
      accNumInput.placeholder = '01234567890123 (14 Digits)';
    } else {
      bankSelectGroup.style.display = 'none';
      bankNameInput.removeAttribute('required');
      bankNameInput.value = '';
      
      accTitleInput.placeholder = 'Mobile Wallet Title';
      accNumInput.placeholder = '03001234567';
    }
  }

  toggleRegisterBtn() {
    const agreeTerms = document.getElementById('agreeTerms').checked;
    const agreePrivacy = document.getElementById('agreePrivacy').checked;
    const btn = document.getElementById('btnRegisterSubmit');
    btn.disabled = !(agreeTerms && agreePrivacy);
  }

  handleRegister(event) {
    event.preventDefault();

    const name = document.getElementById('regName').value;
    const email = document.getElementById('regEmail').value.toLowerCase().trim();
    const whatsapp = document.getElementById('regWhatsApp').value.trim();
    const payoutMethod = document.getElementById('payoutMethod').value;
    const bankName = document.getElementById('bankName').value;
    const accTitle = document.getElementById('accTitle').value;
    const accNumber = document.getElementById('accNumber').value;
    const accIban = document.getElementById('accIban').value;
    const password = document.getElementById('regPassword').value;
    const confirmPassword = document.getElementById('regConfirmPassword').value;

    // Check email uniqueness
    if (this.users.some(u => u.email === email)) {
      this.showToast('Error: Email already registered!', 'error');
      return;
    }

    // Check passwords match
    if (password !== confirmPassword) {
      this.showToast('Error: Passwords do not match!', 'error');
      return;
    }

    // Check CNIC files uploaded
    const cnicFront = this.tempRegisterData ? this.tempRegisterData.cnic_front : null;
    const cnicBack = this.tempRegisterData ? this.tempRegisterData.cnic_back : null;
    if (!cnicFront || !cnicBack) {
      this.showToast('Error: Please upload both CNIC Front and Back pictures.', 'error');
      return;
    }

    // Build Temp Registration Profile
    this.tempRegisterProfile = {
      name,
      email,
      whatsapp,
      role: 'user',
      password,
      status: 'approved', // For ease of test simulator, auto approved user
      payoutMethod,
      bankName: payoutMethod === 'Bank' ? bankName : '',
      accTitle,
      accNumber,
      accIban,
      cnicFront,
      cnicBack,
      joinedDate: new Date().toISOString().split('T')[0]
    };

    // Transition to OTP screen
    document.getElementById('otpEmailLabel').innerText = email;
    
    // Generate Random 6-digit OTP code
    const generatedOtp = String(Math.floor(100000 + Math.random() * 900000));
    this.mockOtp = generatedOtp;
    document.getElementById('mockOtpCode').innerText = generatedOtp;

    // Send real OTP email
    const subject = "Kameti Club - Your Registration OTP Code";
    const bodyText = `Dear ${name},<br><br>Thank you for registering at Kameti Club.<br><br>Your verification OTP code is: <strong>${generatedOtp}</strong>.<br><br>Please enter this code on the verification screen to complete your registration.<br><br>Best regards,<br>Kameti Club Team`;
    this.sendRealEmail(email, subject, bodyText);

    this.showToast('OTP Verification code sent to your email!', 'success');
    this.navigateTo('otp');
  }

  moveOtpFocus(current, nextId) {
    if (current.value.length >= 1 && nextId) {
      document.getElementById(nextId).focus();
    }
  }

  handleOtpVerify(event) {
    event.preventDefault();

    const o1 = document.getElementById('otp1').value;
    const o2 = document.getElementById('otp2').value;
    const o3 = document.getElementById('otp3').value;
    const o4 = document.getElementById('otp4').value;
    const o5 = document.getElementById('otp5').value;
    const o6 = document.getElementById('otp6').value;
    const enteredOtp = o1 + o2 + o3 + o4 + o5 + o6;

    if (enteredOtp === this.mockOtp) {
      // Add Temp Profile to Database
      this.users.push(this.tempRegisterProfile);
      
      // Save data
      this.saveData();

      this.showToast('Registration successful! Welcome to Kameti Club.', 'success');
      
      // Clear forms
      document.getElementById('registerForm').reset();
      document.getElementById('cnicFrontPreview').style.display = 'none';
      document.getElementById('cnicBackPreview').style.display = 'none';
      this.tempRegisterData = null;
      this.tempRegisterProfile = null;
      this.mockOtp = null;

      // Navigate to login
      this.navigateTo('login');
    } else {
      this.showToast('Error: Invalid OTP code! Please check code and try again.', 'error');
    }
  }

  handleLogin(event) {
    event.preventDefault();
    const email = document.getElementById('loginEmail').value.toLowerCase().trim();
    const pass = document.getElementById('loginPassword').value;

    const matchedUser = this.users.find(u => u.email === email && u.password === pass);

    if (matchedUser) {
      this.currentUser = matchedUser;
      sessionStorage.setItem('Kameti_session', JSON.stringify(matchedUser));
      this.showToast(`Logged in successfully! Welcome ${matchedUser.name}`, 'success');

      if (matchedUser.role === 'admin') {
        this.navigateTo('admin-dashboard');
      } else {
        this.navigateTo('user-dashboard');
      }
    } else {
      this.showToast('Error: Invalid email or password credentials!', 'error');
    }
  }

  handleLogout() {
    this.currentUser = null;
    sessionStorage.removeItem('Kameti_session');
    this.showToast('Logged out successfully.', 'success');
    this.navigateTo('home');
  }

  handleForgotPassword(event) {
    event.preventDefault();
    const email = document.getElementById('forgotEmail').value.toLowerCase().trim();
    const matchedUser = this.users.find(u => u.email === email);

    if (!matchedUser) {
      this.showToast('Error: Email address is not registered!', 'error');
      return;
    }

    const resetOtp = String(Math.floor(100000 + Math.random() * 900000));
    this.resetOtpCode = resetOtp;
    this.resetTargetEmail = email;

    // Send real email with recovery OTP code
    const subject = "Kameti Club - Password Reset OTP Code";
    const bodyText = `Dear ${matchedUser.name},<br><br>We received a request to reset your account password.<br><br>Your verification OTP code is: <strong>${resetOtp}</strong>.<br><br>Please enter this code on the recovery screen to reset your password. If you did not request a password reset, please ignore this email.<br><br>Best regards,<br>Kameti Club Team`;
    this.sendRealEmail(email, subject, bodyText);

    document.getElementById('resetEmailLabel').innerText = email;
    this.showToast('Password reset code sent to your email!', 'success');
    
    // Clear inputs
    for (let i = 1; i <= 6; i++) {
      const el = document.getElementById(`resetOtp${i}`);
      if (el) el.value = '';
    }
    document.getElementById('resetNewPassword').value = '';
    document.getElementById('resetConfirmPassword').value = '';

    this.navigateTo('reset-password');
  }

  handleResetPasswordSubmit(event) {
    event.preventDefault();

    let enteredOtp = '';
    for (let i = 1; i <= 6; i++) {
      enteredOtp += document.getElementById(`resetOtp${i}`).value.trim();
    }

    if (enteredOtp !== this.resetOtpCode) {
      this.showToast('Error: Invalid reset OTP code! Please try again.', 'error');
      return;
    }

    const newPass = document.getElementById('resetNewPassword').value;
    const confirmPass = document.getElementById('resetConfirmPassword').value;

    if (newPass.length < 8) {
      this.showToast('Error: Password must be at least 8 characters long.', 'error');
      return;
    }

    if (newPass !== confirmPass) {
      this.showToast('Error: New passwords do not match!', 'error');
      return;
    }

    // Find and update password
    const userIndex = this.users.findIndex(u => u.email === this.resetTargetEmail);
    if (userIndex !== -1) {
      this.users[userIndex].password = newPass;
      this.saveData();

      // Clear temp variables
      this.resetOtpCode = null;
      this.resetTargetEmail = null;

      this.showToast('Password reset successfully! Please log in with your new credentials.', 'success');
      this.navigateTo('login');
    } else {
      this.showToast('Error: User not found in system record.', 'error');
    }
  }

  // --- Pane Switchers ---
  switchUserPane(paneId, element) {
    this.activeUserPane = paneId;
    
    // Update active class on sidebar links
    const sidebar = element.parentElement;
    const links = sidebar.querySelectorAll('.sidebar-link');
    links.forEach(l => l.classList.remove('active'));
    element.classList.add('active');

    // Update active pane
    const panes = document.querySelectorAll('#view-user-dashboard .dashboard-pane');
    panes.forEach(p => p.classList.remove('active'));
    document.getElementById(`pane-${paneId}`).classList.add('active');

    // Pane specific renders
    if (paneId === 'user-overview') {
      this.renderUserOverview();
    } else if (paneId === 'user-kametis') {
      this.renderUserKametis();
    } else if (paneId === 'user-payments') {
      this.renderUserPayments();
    } else if (paneId === 'user-urgent') {
      this.renderUserUrgentRequests();
    } else if (paneId === 'user-support') {
      this.renderUserChat();
    }
  }

  switchAdminPane(paneId, element) {
    this.activeAdminPane = paneId;

    // Update active class on sidebar links
    const sidebar = element.parentElement;
    const links = sidebar.querySelectorAll('.sidebar-link');
    links.forEach(l => l.classList.remove('active'));
    element.classList.add('active');

    // Update active pane
    const panes = document.querySelectorAll('#view-admin-dashboard .dashboard-pane');
    panes.forEach(p => p.classList.remove('active'));
    document.getElementById(`pane-${paneId}`).classList.add('active');

    // Pane specific renders
    if (paneId === 'admin-overview') {
      this.renderAdminOverview();
    } else if (paneId === 'admin-users') {
      this.renderAdminUsers();
    } else if (paneId === 'admin-groups') {
      this.renderAdminGroups();
    } else if (paneId === 'admin-payouts') {
      this.renderAdminPayoutControl();
    } else if (paneId === 'admin-support') {
      this.renderAdminSupportDesk();
    } else if (paneId === 'admin-emails') {
      this.renderAdminAIEmails();
    } else if (paneId === 'admin-analytics') {
      this.renderAdminAnalytics();
    }
  }

  // ==========================================
  // --- USER DASHBOARD CODE ---
  // ==========================================
  renderUserDashboard() {
    // Switch to first pane
    const sidebarLinks = document.querySelectorAll('#view-user-dashboard .sidebar-link');
    this.switchUserPane('user-overview', sidebarLinks[0]);
  }

  renderUserOverview() {
    document.getElementById('userProfileName').innerText = this.currentUser.name;
    document.getElementById('userOverviewWelcomeName').innerText = this.currentUser.name.split(' ')[0];

    // Compute metrics
    const userGroups = this.groups.filter(g => g.members.includes(this.currentUser.email));
    const totalLimit = userGroups.reduce((acc, curr) => acc + curr.amount, 0);
    document.getElementById('userOverviewTotalLimit').innerText = `Rs. ${totalLimit.toLocaleString()}`;

    // Monthly due (Check if paid current running cycle month)
    let dueAmount = 0;
    userGroups.forEach(g => {
      if (g.status === 'running') {
        const cycleName = this.getGroupMonthName(g, g.cycleMonth);
        // Check if transaction exists
        const isPaid = this.transactions.some(t => t.userEmail === this.currentUser.email && t.groupId === g.id && t.cycleMonthName === cycleName && t.status === 'approved');
        if (!isPaid) {
          dueAmount += g.monthlyPayment + 100; // Capital + Rs 100 admin fee
        }
      }
    });
    document.getElementById('userOverviewDueAmt').innerText = `Rs. ${dueAmount.toLocaleString()}`;

    // Your Draw Month
    let drawText = 'Not Joined';
    if (userGroups.length > 0) {
      const drawings = [];
      userGroups.forEach(g => {
        if (g.status === 'running') {
          const index = g.rotation.indexOf(this.currentUser.email);
          if (index !== -1) {
            const drawMonthName = this.getGroupMonthName(g, index + 1);
            drawings.push(`${g.name} (${drawMonthName})`);
          }
        }
      });
      drawText = drawings.length > 0 ? drawings.join('<br>') : 'Pending Starting...';
    }
    document.getElementById('userOverviewDrawMonth').innerHTML = drawText;

    // Load Payout details cards
    document.getElementById('userPayoutMethod').innerText = this.currentUser.payoutMethod;
    if (this.currentUser.payoutMethod === 'Bank') {
      document.getElementById('userBankDetailsDiv').style.display = 'block';
      document.getElementById('userPayoutBank').innerText = this.currentUser.bankName;
    } else {
      document.getElementById('userBankDetailsDiv').style.display = 'none';
    }
    document.getElementById('userPayoutTitle').innerText = this.currentUser.accTitle;
    document.getElementById('userPayoutNumber').innerText = this.currentUser.accNumber;
    document.getElementById('userPayoutIban').innerText = this.currentUser.accIban || 'N/A';

    // Render Recent payments log table
    const tableBody = document.getElementById('userOverviewPaymentsTable');
    tableBody.innerHTML = '';
    const myPayments = this.transactions.filter(t => t.userEmail === this.currentUser.email && t.type !== 'payout');
    
    if (myPayments.length === 0) {
      tableBody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-muted);">No payment records found.</td></tr>`;
      return;
    }

    myPayments.reverse().forEach(p => {
      const groupObj = this.groups.find(g => g.id === p.groupId);
      const groupName = groupObj ? groupObj.name : 'Unknown Group';
      
      let statusBadge = '';
      if (p.status === 'approved') statusBadge = `<span class="badge badge-success">Approved</span>`;
      else if (p.status === 'pending') statusBadge = `<span class="badge badge-warning">Awaiting Approval</span>`;
      else statusBadge = `<span class="badge badge-danger">Rejected</span>`;

      tableBody.innerHTML += `
        <tr>
          <td>${p.date}</td>
          <td><strong>${groupName}</strong></td>
          <td>${p.cycleMonthName}</td>
          <td>Rs. ${p.amount.toLocaleString()}</td>
          <td>Rs. ${p.serviceFee}</td>
          <td style="${p.lateFee > 0 ? 'color: #ef4444; font-weight: bold;' : ''}">Rs. ${p.lateFee}</td>
          <td>${statusBadge}</td>
        </tr>
      `;
    });
  }

  renderUserKametis() {
    const avContainer = document.getElementById('availableGroupsContainer');
    avContainer.innerHTML = '';

    const myJoinedContainer = document.getElementById('myJoinedKametisContainer');
    myJoinedContainer.innerHTML = '';

    this.groups.forEach(g => {
      const isMember = g.members.includes(this.currentUser.email);
      const currentMembersCount = g.members.length;
      
      // Calculate progress percentage
      const progressPercent = (currentMembersCount / 10) * 100;

      const groupCardHtml = `
        <div class="group-card animate-scale-in">
          <div>
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem; width: 100%;">
              <span class="group-tag-inline">Rs. ${(g.amount).toLocaleString()} Payout</span>
              <span class="badge ${g.status === 'running' ? 'badge-success' : 'badge-warning'}" style="font-size: 0.72rem; font-weight: bold; padding: 0.15rem 0.5rem; text-transform: uppercase;">
                ${g.status === 'running' ? 'Running' : 'Recruiting'}
              </span>
            </div>
            <h3 class="group-title">${g.name}</h3>
            <div class="group-size">${currentMembersCount}/10 Members Joined</div>
            
            <div class="progress-bar-wrapper">
              <div class="progress-bar" style="width: ${progressPercent}%;"></div>
            </div>

            <div class="group-details">
              <div class="detail-row">
                <span class="label">Monthly Deposit:</span>
                <span class="val">Rs. ${g.monthlyPayment.toLocaleString()}</span>
              </div>
              <div class="detail-row">
                <span class="label">Admin Service Fee:</span>
                <span class="val">Rs. 100 / mo</span>
              </div>
            </div>
          </div>
          
          <div>
            ${isMember 
              ? `<button class="btn btn-outline" style="width: 100%; pointer-events: none;" disabled><i class="fa-solid fa-circle-check"></i> Already Joined</button>` 
              : g.status === 'running' 
                ? `<button class="btn btn-ghost" style="width: 100%;" disabled>Group Full</button>` 
                : `<button class="btn btn-primary" style="width: 100%;" onclick="app.joinGroup('${g.id}')">Join Kameti Group</button>`
            }
          </div>
        </div>
      `;

      if (isMember) {
        // Draw member rotation info
        const rotationIndex = g.rotation.indexOf(this.currentUser.email);
        const payoutMonthText = rotationIndex !== -1 ? this.getGroupMonthName(g, rotationIndex + 1) : 'Pending Group Start';
        
        // Build dot elements for payments tracker
        let paymentDotsHtml = '';
        if (g.status === 'running') {
          for (let monthIdx = 1; monthIdx <= 10; monthIdx++) {
            const mName = this.getGroupMonthName(g, monthIdx);
            
            // Check status of payment
            const paymentTx = this.transactions.find(t => t.userEmail === this.currentUser.email && t.groupId === g.id && t.cycleMonthName === mName);
            let dotClass = 'unpaid';
            let tooltipText = `${mName}: Unpaid`;

            if (paymentTx) {
              if (paymentTx.status === 'approved') {
                dotClass = 'paid';
                tooltipText = `${mName}: Paid (TxID: ${paymentTx.txid})`;
              } else if (paymentTx.status === 'pending') {
                dotClass = 'pending';
                tooltipText = `${mName}: Pending Approval`;
              }
            } else if (g.cycleMonth > monthIdx) {
              dotClass = 'late';
              tooltipText = `${mName}: Defaulted/Late`;
            }

            const dotLabel = mName.split(' ')[0].substr(0, 3);
            paymentDotsHtml += `
              <div class="payment-dot ${dotClass}" style="font-size: 0.68rem; display: flex; align-items: center; justify-content: center; width: 44px; height: 44px;">
                ${dotLabel}
                <span class="tooltip">${tooltipText}</span>
              </div>
            `;
          }
        }

        // Build group members ledger list and month payment checklist
        let ledgerRowsHtml = '';
        let thColsHtml = '';
        if (g.status === 'running') {
          // Build dynamic month headers
          for (let m = 1; m <= 10; m++) {
            const mName = this.getGroupMonthName(g, m);
            const shortMonth = mName.split(' ')[0].substr(0, 3);
            thColsHtml += `<th style="text-align: center; font-size: 0.8rem;" title="${mName}">${shortMonth}</th>`;
          }

          g.rotation.forEach((email, drawIdx) => {
            const memberUser = this.users.find(u => u.email === email);
            const memberName = memberUser ? memberUser.name : email;
            
            // Highlight draw status
            const drawMonth = drawIdx + 1;
            let drawStatusBadge = '';
            if (g.cycleMonth > drawMonth) {
              drawStatusBadge = '<span class="badge badge-success">Drawn (Paid Out)</span>';
            } else if (g.cycleMonth === drawMonth) {
              drawStatusBadge = '<span class="badge badge-info">Drawn This Month</span>';
            } else {
              drawStatusBadge = '<span class="badge badge-warning">Not Drawn</span>';
            }

            // Check payments checklist for Month 1 to Month 10
            let paymentColsHtml = '';
            for (let m = 1; m <= 10; m++) {
              const mName = this.getGroupMonthName(g, m);
              const isPaid = this.transactions.some(t => t.userEmail === email && t.groupId === g.id && t.cycleMonthName === mName && t.status === 'approved');
              
              if (isPaid) {
                paymentColsHtml += '<td style="text-align: center;"><i class="fa-solid fa-circle-check" style="color: var(--primary); font-size: 1.05rem;" title="Paid"></i></td>';
              } else if (g.cycleMonth > m) {
                paymentColsHtml += '<td style="text-align: center;"><i class="fa-solid fa-circle-xmark" style="color: #ef4444; font-size: 1.05rem;" title="Defaulted/Late"></i></td>';
              } else {
                paymentColsHtml += '<td style="text-align: center;"><i class="fa-solid fa-circle" style="color: #cbd5e1; font-size: 0.75rem;" title="Unpaid"></i></td>';
              }
            }

            const drawMonthName = this.getGroupMonthName(g, drawMonth);
            ledgerRowsHtml += `
              <tr style="${email === this.currentUser.email ? 'background: rgba(16, 185, 129, 0.03);' : ''}">
                <td><strong>${memberName}</strong>${email === this.currentUser.email ? ' <span style="color: var(--primary); font-size: 0.75rem; font-weight: bold;">(You)</span>' : ''}</td>
                <td>${drawMonthName}</td>
                <td>${drawStatusBadge}</td>
                ${paymentColsHtml}
              </tr>
            `;
          });
        }

        const myCardHtml = `
          <div class="glass-panel" style="margin-bottom: 2rem; position: relative; overflow-x: auto;">
            <h3 style="margin-bottom: 0.5rem; color: var(--primary);">${g.name}</h3>
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-bottom: 1.5rem; font-size: 0.9rem;">
              <div><strong>Your Draw Month:</strong> ${payoutMonthText}</div>
              <div><strong>Current Kameti Cycle:</strong> ${g.status === 'running' ? this.getGroupMonthName(g, g.cycleMonth) : 'Waiting to start'}</div>
              <div><strong>Value Capacity:</strong> Rs. ${g.amount.toLocaleString()} Payout</div>
            </div>
            
            ${g.status === 'running' 
              ? `
              <h4 style="font-size: 0.85rem; text-transform: uppercase; color: var(--text-muted); margin-bottom: 0.5rem;">Your Monthly Payment Record</h4>
              <div class="payment-grid" style="margin-bottom: 2rem;">${paymentDotsHtml}</div>

              <h4 style="font-size: 1.05rem; margin-top: 1.5rem; margin-bottom: 0.75rem;"><i class="fa-solid fa-table-list" style="color: var(--primary); margin-right: 0.5rem;"></i> Group Members Draw & Payment Ledger</h4>
              <div class="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>Member Name</th>
                      <th>Draw Month</th>
                      <th>Draw Status</th>
                      ${thColsHtml}
                    </tr>
                  </thead>
                  <tbody>
                    ${ledgerRowsHtml}
                  </tbody>
                </table>
              </div>
              ` 
              : `
              <div class="info-alert" style="margin: 0.5rem 0 0 0;">
                <i class="fa-solid fa-spinner fa-spin"></i>
                <span>Waiting for 10 members to fill this group before initiating the rotation draw. Invite your friends to join!</span>
              </div>
              <button class="btn btn-secondary" style="margin-top: 1rem; padding: 0.5rem 1rem; font-size: 0.85rem;" onclick="app.simulateFillGroup('${g.id}')">
                <i class="fa-solid fa-wand-magic-sparkles"></i> Auto-Fill Group (Simulator Demo)
              </button>
              `
            }
          </div>
        `;
        myJoinedContainer.innerHTML += myCardHtml;
      }
      
      avContainer.innerHTML += groupCardHtml;
    });

    if (myJoinedContainer.innerHTML === '') {
      myJoinedContainer.innerHTML = `<div style="text-align: center; color: var(--text-muted); border: 1.5px dashed var(--card-border); padding: 2rem; border-radius: 12px;">You haven't joined any kametis yet. Join from the available list above!</div>`;
    }
  }

  joinGroup(groupId) {
    const group = this.groups.find(g => g.id === groupId);
    if (!group) return;

    // Enforce one group limit
    const joinedGroup = this.groups.find(g => g.members.includes(this.currentUser.email) && g.status !== 'completed');
    if (joinedGroup) {
      this.showToast(`Error: You can only join one kameti group at a time. You are already in "${joinedGroup.name}".`, 'error');
      return;
    }

    if (group.members.includes(this.currentUser.email)) return;

    group.members.push(this.currentUser.email);
    this.showToast(`Successfully joined group ${group.name}!`, 'success');
    
    // Check if group hits 10 members, start it!
    if (group.members.length === 10) {
      this.initiateGroupRotation(group);
    }

    this.saveData();
    this.renderUserKametis();
    this.renderPublicGroups();
  }

  simulateFillGroup(groupId) {
    const group = this.groups.find(g => g.id === groupId);
    if (!group) return;

    // Fill group to 10 by creating dummy members on the fly
    const needed = 10 - group.members.length;
    for (let idx = 0; idx < needed; idx++) {
      const dummyIndex = group.members.length + 1;
      const dummyEmail = `member${dummyIndex}@kameticlub.com`;
      
      // Ensure this dummy user is registered in the database for the demo to work
      if (!this.users.some(u => u.email === dummyEmail)) {
        this.users.push({
          name: `Demo Member ${dummyIndex}`,
          email: dummyEmail,
          role: "user",
          password: "password123",
          whatsapp: `0300112233${dummyIndex}`,
          status: 'approved',
          payoutMethod: 'EasyPaisa',
          accTitle: `Demo Member ${dummyIndex}`,
          accNumber: `0300112233${dummyIndex}`,
          cnicFront: 'placeholder_cnic_front',
          cnicBack: 'placeholder_cnic_back',
          joinedDate: new Date().toISOString().split('T')[0]
        });
      }
      if (!group.members.includes(dummyEmail)) {
        group.members.push(dummyEmail);
      }
    }

    this.showToast(`Simulator: Filled ${group.name} with 10 members!`, 'success');
    this.initiateGroupRotation(group);
    this.saveData();
    this.renderUserKametis();
    this.renderPublicGroups();
  }

  initiateGroupRotation(group) {
    group.status = 'running';
    group.cycleMonth = 1;
    group.startDate = this.simulatedTime ? this.simulatedTime.toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
    
    // Shuffle members for rotation draw order
    const shuffled = [...group.members];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    group.rotation = shuffled;

    this.showToast(`🎉 Group "${group.name}" has hit 10 members and is active! Draw order locked in.`, 'success');

    // Notify all 10 members of the drawing and payment due rules
    group.members.forEach(email => {
      const userObj = this.users.find(u => u.email === email);
      const drawIndex = group.rotation.indexOf(email) + 1;
      const amountStr = (group.monthlyPayment).toLocaleString();

      if (!this.chats[email]) this.chats[email] = [];
      this.chats[email].push({
        sender: 'admin',
        text: `📢 Welcome to "${group.name}"! The group is now ACTIVE. Your payout month is **Month ${drawIndex}**. Please make your first monthly deposit of Rs. ${amountStr} + Rs. 100 admin fee between the 1st and the 10th. Note that unpaid fees by the 10th @ 10:00 AM PKT will result in account suspension!`,
        time: this.formatCurrentTimestamp()
      });

      // Send real welcome email to member
      const drawMonthName = this.getGroupMonthName(group, drawIndex);
      const firstMonthName = this.getGroupMonthName(group, 1);
      const subject = `Kameti Club - Group "${group.name}" is now ACTIVE!`;
      const bodyText = `Dear Saver,<br><br>We are excited to inform you that your Kameti group <strong>${group.name}</strong> is now ACTIVE!<br><br>Your scheduled payout month is: <strong>${drawMonthName}</strong>.<br><br>Please submit your first monthly deposit of Rs. ${amountStr} + Rs. 100 admin fee before the 10th of ${firstMonthName} to avoid late fee penalties.<br><br>Log in to view the live dashboard and payment ledger.<br><br>Best regards,<br>Kameti Club Team`;
      this.sendRealEmail(email, subject, bodyText);
    });

    // Auto-recreate same group as a new Batch
    const baseGroupName = group.name.replace(/\s*-\s*Batch\s*\d+$/i, '');
    const nextBatch = (group.batch || 1) + 1;
    const newGroupId = group.id.replace(/_batch_\d+$/i, '') + `_batch_${nextBatch}`;

    if (!this.groups.some(g => g.id === newGroupId)) {
      const nextBatchObj = {
        id: newGroupId,
        name: `${baseGroupName} - Batch ${nextBatch}`,
        amount: group.amount,
        monthlyPayment: group.monthlyPayment,
        members: [],
        status: 'waiting',
        cycleMonth: 1,
        rotation: [],
        startDate: null,
        batch: nextBatch
      };
      this.groups.push(nextBatchObj);
      this.showToast(`Auto-recreated "${baseGroupName} - Batch ${nextBatch}" for new users.`, 'info');

      // Refresh the public landing page list in real-time
      this.renderPublicGroups();

      // Ask to Join after launched
      setTimeout(() => {
        const wantsToJoin = confirm(`🎉 Group "${group.name}" is now active!\n\nWe have launched a new batch: "${nextBatchObj.name}".\nWould you like to join this new Batch?`);
        if (wantsToJoin) {
          if (this.currentUser) {
            this.joinGroup(newGroupId);
          } else {
            this.showToast("Please register an account to join the new Batch group!", "info");
            this.navigateTo('register');
          }
        }
      }, 1000);
    }
  }

  renderUserPayments() {
    // Populate dropdown of joined groups
    const payGroupSelector = document.getElementById('payGroupSelector');
    payGroupSelector.innerHTML = '<option value="" disabled selected>Choose Group</option>';

    const myJoinedRunning = this.groups.filter(g => g.members.includes(this.currentUser.email) && g.status === 'running');
    myJoinedRunning.forEach(g => {
      payGroupSelector.innerHTML += `<option value="${g.id}">${g.name} (Capital: Rs. ${g.amount.toLocaleString()})</option>`;
    });

    // Preset current date
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    document.getElementById('paySimulateDate').value = `${yyyy}-${mm}-${dd}`;

    this.updatePaymentCalculator();
  }

  updatePaymentCalculator() {
    const groupId = document.getElementById('payGroupSelector').value;
    const selectedDateStr = document.getElementById('paySimulateDate').value;
    
    const baseAmtEl = document.getElementById('calcBaseAmt');
    const lateFeeEl = document.getElementById('calcLateFeeAmt');
    const totalAmtEl = document.getElementById('calcTotalAmt');
    const lateFeeRow = document.getElementById('calcLateFeeRow');

    if (!groupId) {
      baseAmtEl.innerText = 'Rs. 0';
      lateFeeEl.innerText = 'Rs. 0';
      totalAmtEl.innerText = 'Rs. 0';
      lateFeeRow.style.display = 'none';
      return;
    }

    const group = this.groups.find(g => g.id === groupId);
    const monthlyPayment = group.monthlyPayment;
    baseAmtEl.innerText = `Rs. ${monthlyPayment.toLocaleString()}`;

    // Compute late penalty
    // Payment due on/before 10th of month.
    // parse day from simulated payment date
    let lateFee = 0;
    if (selectedDateStr) {
      const selectedDay = parseInt(selectedDateStr.split('-')[2]);
      if (selectedDay > 10) {
        const daysLate = selectedDay - 10;
        lateFee = daysLate * 500;
      }
    }

    if (lateFee > 0) {
      lateFeeRow.style.display = 'flex';
      lateFeeEl.innerText = `Rs. ${lateFee.toLocaleString()}`;
    } else {
      lateFeeRow.style.display = 'none';
      lateFeeEl.innerText = 'Rs. 0';
    }

    const total = monthlyPayment + 100 + lateFee;
    totalAmtEl.innerText = `Rs. ${total.toLocaleString()}`;
  }

  handleUserPaymentSubmit(event) {
    event.preventDefault();

    const groupId = document.getElementById('payGroupSelector').value;
    const cycleMonthName = document.getElementById('payMonthSelector').value;
    const simulateDate = document.getElementById('paySimulateDate').value;
    const txid = document.getElementById('payTxid').value.trim();
    const receiptFileInput = document.getElementById('payReceiptFile');

    if (!groupId) {
      this.showToast('Error: Please select a valid group.', 'error');
      return;
    }

    const group = this.groups.find(g => g.id === groupId);
    const baseAmount = group.monthlyPayment;

    // Check if this month is already paid
    const alreadyExists = this.transactions.some(t => t.userEmail === this.currentUser.email && t.groupId === groupId && t.cycleMonthName === cycleMonthName && t.status !== 'rejected');
    if (alreadyExists) {
      this.showToast(`Error: A payment for ${cycleMonthName} has already been submitted or approved!`, 'error');
      return;
    }

    // Calculate penalty fee based on simulated date
    const selectedDay = parseInt(simulateDate.split('-')[2]);
    let lateFee = 0;
    if (selectedDay > 10) {
      lateFee = (selectedDay - 10) * 500;
    }

    // Process receipt file
    const file = receiptFileInput.files[0];
    const submitTransaction = (receiptBase64) => {
      this.transactions.push({
        id: `txn_${Math.random().toString(36).substr(2, 9)}`,
        userEmail: this.currentUser.email,
        groupId: groupId,
        cycleMonthName: cycleMonthName,
        amount: baseAmount,
        serviceFee: 100,
        lateFee: lateFee,
        total: baseAmount + 100 + lateFee,
        txid: txid,
        receipt: receiptBase64 || 'placeholder_receipt',
        date: simulateDate,
        status: 'pending'
      });

      this.saveData();
      this.showToast('Payment submitted successfully for verification!', 'success');
      
      // Reset Form & switch back to Overview
      document.getElementById('payTxid').value = '';
      receiptFileInput.value = '';
      this.renderUserOverview();
      const sidebarLinks = document.querySelectorAll('#view-user-dashboard .sidebar-link');
      this.switchUserPane('user-overview', sidebarLinks[0]);
    };

    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        submitTransaction(e.target.result);
      };
      reader.readAsDataURL(file);
    } else {
      submitTransaction(null);
    }
  }

  renderUserUrgentRequests() {
    // Populate active running groups selector
    const selector = document.getElementById('urgentGroupSelector');
    selector.innerHTML = '<option value="" disabled selected>Choose Group</option>';

    const myJoinedRunning = this.groups.filter(g => g.members.includes(this.currentUser.email) && g.status === 'running');
    myJoinedRunning.forEach(g => {
      selector.innerHTML += `<option value="${g.id}">${g.name}</option>`;
    });

    // Populate user's submitted requests table
    const tableBody = document.getElementById('userUrgentRequestsTable');
    tableBody.innerHTML = '';

    const myRequests = this.urgentRequests.filter(r => r.userEmail === this.currentUser.email);
    if (myRequests.length === 0) {
      tableBody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--text-muted);">No urgent draw requests submitted.</td></tr>`;
      return;
    }

    myRequests.reverse().forEach(r => {
      const groupObj = this.groups.find(g => g.id === r.groupId);
      const groupName = groupObj ? groupObj.name : 'Unknown Group';

      let badgeHtml = '';
      if (r.status === 'pending') badgeHtml = `<span class="badge badge-warning">Awaiting Approval</span>`;
      else if (r.status === 'approved') badgeHtml = `<span class="badge badge-success">Approved / Swapped</span>`;
      else badgeHtml = `<span class="badge badge-danger">Rejected</span>`;

      tableBody.innerHTML += `
        <tr>
          <td>${r.date}</td>
          <td><strong>${groupName}</strong></td>
          <td style="max-width: 250px; text-overflow: ellipsis; overflow: hidden; white-space: nowrap;">${r.reason}</td>
          <td>${badgeHtml}</td>
        </tr>
      `;
    });
  }

  handleUrgentRequestSubmit(event) {
    event.preventDefault();

    const groupId = document.getElementById('urgentGroupSelector').value;
    const reason = document.getElementById('urgentReason').value.trim();

    if (!groupId) {
      this.showToast('Error: Please select a valid group.', 'error');
      return;
    }

    // Check if duplicate pending exists
    const duplicate = this.urgentRequests.some(r => r.userEmail === this.currentUser.email && r.groupId === groupId && r.status === 'pending');
    if (duplicate) {
      this.showToast('Error: You already have a pending urgent request for this group!', 'error');
      return;
    }

    this.urgentRequests.push({
      id: `urg_${Math.random().toString(36).substr(2, 9)}`,
      userEmail: this.currentUser.email,
      groupId: groupId,
      reason: reason,
      status: 'pending',
      date: new Date().toISOString().split('T')[0]
    });

    this.saveData();
    this.showToast('Urgent payout request submitted successfully to admin.', 'success');
    document.getElementById('urgentReason').value = '';
    this.renderUserUrgentRequests();
  }

  renderUserChat() {
    const userChatBody = document.getElementById('userChatBody');
    userChatBody.innerHTML = '';

    const email = this.currentUser.email;
    const messages = this.chats[email] || [];

    if (messages.length === 0) {
      userChatBody.innerHTML = `<div style="text-align: center; color: var(--text-muted); margin-top: 4rem;">Start a conversation. Introduce your problem to the support desk.</div>`;
      return;
    }

    messages.forEach(m => {
      const cls = m.sender === 'user' ? 'sent' : 'received';
      const timeStr = m.time.split(' ')[1].substr(0, 5); // Just hh:mm
      userChatBody.innerHTML += `
        <div class="chat-message ${cls}">
          <div>${m.text}</div>
          <div class="timestamp">${timeStr}</div>
        </div>
      `;
    });

    // Auto-scroll chat body to bottom
    userChatBody.scrollTop = userChatBody.scrollHeight;
  }

  sendUserMessage(event) {
    event.preventDefault();
    const inputEl = document.getElementById('userChatInput');
    const msgText = inputEl.value.trim();
    if (!msgText) return;

    const email = this.currentUser.email;
    if (!this.chats[email]) {
      this.chats[email] = [];
    }

    const timestamp = this.formatCurrentTimestamp();
    this.chats[email].push({
      sender: 'user',
      text: msgText,
      time: timestamp
    });

    this.saveData();
    inputEl.value = '';
    this.renderUserChat();

    // Trigger simulation reply after 1.5 seconds
    setTimeout(() => {
      this.chats[email].push({
        sender: 'admin',
        text: 'Thank you for messaging support. Our agent will verify your request and reply shortly. Please wait.',
        time: this.formatCurrentTimestamp()
      });
      this.saveData();
      if (this.currentView === 'user-dashboard' && this.activeUserPane === 'user-support') {
        this.renderUserChat();
      }
    }, 1500);
  }

  formatCurrentTimestamp() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}`;
  }

  // ==========================================
  // --- ADMIN DASHBOARD CODE ---
  // ==========================================
  renderAdminDashboard() {
    // Switch to first pane
    const sidebarLinks = document.querySelectorAll('#view-admin-dashboard .sidebar-link');
    this.switchAdminPane('admin-overview', sidebarLinks[0]);
  }

  renderAdminOverview() {
    // Stats overview cards
    document.getElementById('adminTotalUsers').innerText = this.users.filter(u => u.role !== 'admin').length;
    document.getElementById('adminTotalGroups').innerText = this.groups.filter(g => g.status === 'running').length;
    
    const approvedPayments = this.transactions.filter(t => t.status === 'approved' && t.type !== 'payout');
    const totalCollected = approvedPayments.reduce((acc, curr) => acc + curr.total, 0);
    document.getElementById('adminTotalFunds').innerText = `Rs. ${totalCollected.toLocaleString()}`;

    // Render Awaiting Payment Approvals Table
    const pendingPaymentsTable = document.getElementById('adminOverviewPendingPaymentsTable');
    pendingPaymentsTable.innerHTML = '';

    const pendingTxns = this.transactions.filter(t => t.status === 'pending');
    if (pendingTxns.length === 0) {
      pendingPaymentsTable.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-muted);">No pending payments awaiting verification.</td></tr>`;
    } else {
      pendingTxns.forEach(txn => {
        const userObj = this.users.find(u => u.email === txn.userEmail);
        const groupObj = this.groups.find(g => g.id === txn.groupId);
        
        const userName = userObj ? userObj.name : txn.userEmail;
        const groupName = groupObj ? groupObj.name : 'Unknown Group';

        pendingPaymentsTable.innerHTML += `
          <tr>
            <td><strong>${userName}</strong></td>
            <td>${groupName}</td>
            <td>${txn.cycleMonthName}</td>
            <td>Rs. ${(txn.total).toLocaleString()}</td>
            <td><code>${txn.txid}</code></td>
            <td>
              <button class="btn btn-outline" style="padding: 0.35rem 0.75rem; font-size: 0.8rem;" onclick="app.viewPaymentReceipt('${txn.id}')">
                <i class="fa-solid fa-image"></i> View Receipt
              </button>
            </td>
            <td>
              <button class="btn btn-primary" style="padding: 0.35rem 0.75rem; font-size: 0.8rem;" onclick="app.approvePaymentDirectly('${txn.id}')">Approve</button>
            </td>
          </tr>
        `;
      });
    }

    // Render Scheduled Disbursements (On 10th of Month)
    const payoutsTable = document.getElementById('adminOverviewPayoutsTable');
    payoutsTable.innerHTML = '';

    const runningGroups = this.groups.filter(g => g.status === 'running');
    let hasPayouts = false;

    runningGroups.forEach(g => {
      const currentCycleMonthName = this.getGroupMonthName(g, g.cycleMonth);
      
      // Winner email for this month
      const winnerEmail = g.rotation[g.cycleMonth - 1];
      if (!winnerEmail) return;

      // Check if already paid out
      const alreadyPaidOut = this.transactions.some(t => t.type === 'payout' && t.groupId === g.id && t.cycleMonthName === currentCycleMonthName);
      if (alreadyPaidOut) return;

      hasPayouts = true;
      const winnerUser = this.users.find(u => u.email === winnerEmail);
      const winnerName = winnerUser ? winnerUser.name : winnerEmail;
      
      let recipientDetails = '';
      if (winnerUser) {
        recipientDetails = `
          <strong>${winnerUser.payoutMethod}</strong><br>
          Title: ${winnerUser.accTitle}<br>
          Acc: ${winnerUser.accNumber} 
          ${winnerUser.bankName ? `(${winnerUser.bankName})` : ''}
        `;
      } else {
        recipientDetails = winnerEmail;
      }

      payoutsTable.innerHTML += `
        <tr>
          <td><strong>${winnerName}</strong><br><span style="font-size: 0.75rem; color: var(--text-muted);">${winnerEmail}</span></td>
          <td><strong>${g.name}</strong></td>
          <td>${currentCycleMonthName} Draw</td>
          <td><strong>Rs. ${g.amount.toLocaleString()}</strong></td>
          <td style="font-size: 0.85rem;">${recipientDetails}</td>
          <td>
            <button class="btn btn-secondary" style="padding: 0.4rem 0.8rem; font-size: 0.8rem;" onclick="app.disbursePayout('${g.id}', '${winnerEmail}', ${g.cycleMonth}, ${g.amount})">
              <i class="fa-solid fa-paper-plane"></i> Log Payout
            </button>
          </td>
        </tr>
      `;
    });

    if (!hasPayouts) {
      payoutsTable.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-muted);">No payout disbursements pending.</td></tr>`;
    }
  }

  viewPaymentReceipt(txnId) {
    const txn = this.transactions.find(t => t.id === txnId);
    if (!txn) return;

    this.selectedVerifyTxnId = txnId;

    const modalReceiptImg = document.getElementById('modalReceiptImg');
    if (txn.receipt.startsWith('data:image')) {
      modalReceiptImg.src = txn.receipt;
    } else {
      // Mock placeholder receipt
      modalReceiptImg.src = 'https://placehold.co/400x500/10b981/ffffff?text=Mock+Bank+Transfer+Receipt';
    }

    this.openModal('modal-receipt-viewer');
  }

  approveSelectedPayment() {
    if (!this.selectedVerifyTxnId) return;
    this.approvePaymentDirectly(this.selectedVerifyTxnId);
    this.closeModal('modal-receipt-viewer');
    this.selectedVerifyTxnId = null;
  }

  approvePaymentDirectly(txnId) {
    const txn = this.transactions.find(t => t.id === txnId);
    if (!txn) return;

    txn.status = 'approved';
    this.showToast('Payment transaction successfully approved!', 'success');
    this.saveData();

    // Re-render current dashboard
    if (this.activeAdminPane === 'admin-overview') {
      this.renderAdminOverview();
    }
  }

  disbursePayout(groupId, recipientEmail, month, amount) {
    const group = this.groups.find(g => g.id === groupId);
    if (!group) return;

    const txid = prompt("Please enter the Bank / Wallet Transfer Transaction ID (TxID) to log this payout:", `payout_tx_${Math.floor(100000 + Math.random() * 900000)}`);
    if (txid === null) return; // User cancelled
    if (txid.trim() === '') {
      this.showToast('Error: Transaction ID is required to record a disbursement.', 'error');
      return;
    }

    // Log Payout transaction
    this.transactions.push({
      id: `payout_${Math.random().toString(36).substr(2, 9)}`,
      type: 'payout',
      recipientEmail: recipientEmail,
      groupId: groupId,
      cycleMonthName: this.getGroupMonthName(group, month),
      amount: amount,
      txid: txid,
      date: new Date().toISOString().split('T')[0]
    });

    // Notify winner via chat
    if (!this.chats[recipientEmail]) this.chats[recipientEmail] = [];
    this.chats[recipientEmail].push({
      sender: 'admin',
      text: `🎉 CONGRATULATIONS! Your kameti draw turn has arrived! Rs. ${amount.toLocaleString()} has been disbursed to your registered account. TxID: ${txid}.`,
      time: this.formatCurrentTimestamp()
    });

    // Send real payout email
    const subject = `Kameti Club - Payout Disbursed!`;
    const bodyText = `Dear Saver,<br><br>We are pleased to inform you that the monthly pool payout of <strong>Rs. ${amount.toLocaleString()}</strong> for group <strong>${group.name}</strong> has been successfully transferred to your account.<br><br>Transaction ID: <strong>${txid}</strong><br><br>Thank you for saving and growing with Kameti Club!<br><br>Best regards,<br>Kameti Club Team`;
    this.sendRealEmail(recipientEmail, subject, bodyText);

    // Advance group month cycle if 10th draw is reached, otherwise increment month
    if (group.cycleMonth >= 10) {
      group.status = 'completed';
    } else {
      group.cycleMonth += 1;
    }

    this.saveData();
    this.showToast('Payout recorded and cycle updated successfully!', 'success');
    this.renderAdminOverview();
  }

  renderAdminUsers() {
    const tableBody = document.getElementById('adminUsersTableBody');
    tableBody.innerHTML = '';

    const members = this.users.filter(u => u.role !== 'admin');
    if (members.length === 0) {
      tableBody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--text-muted);">No members registered yet.</td></tr>`;
      return;
    }

    members.forEach(u => {
      let payoutText = `<strong>${u.payoutMethod}</strong><br>${u.accTitle}<br>${u.accNumber}`;
      if (u.bankName) payoutText += `<br>(${u.bankName})`;

      tableBody.innerHTML += `
        <tr>
          <td><strong>${u.name}</strong></td>
          <td>${u.email}</td>
          <td>${u.whatsapp}</td>
          <td style="font-size: 0.8rem; line-height: 1.3;">${payoutText}</td>
          <td>
            <button class="btn btn-outline" style="padding: 0.3rem 0.6rem; font-size: 0.75rem;" onclick="app.viewUserCNIC('${u.email}')">
              <i class="fa-solid fa-passport"></i> View CNIC
            </button>
          </td>
          <td style="font-size: 0.8rem;">${u.joinedDate}</td>
          <td><span class="badge badge-success">${u.status}</span></td>
          <td>
            <button class="btn btn-ghost" style="color: #ef4444; padding: 0.3rem 0.6rem; font-size: 0.85rem;" onclick="app.deleteUser('${u.email}')">
              <i class="fa-solid fa-trash-can"></i> Remove
            </button>
          </td>
        </tr>
      `;
    });
  }

  viewUserCNIC(email) {
    const user = this.users.find(u => u.email === email);
    if (!user) return;

    document.getElementById('cnicViewerTitle').innerText = `${user.name}'s CNIC Verification`;
    
    const fImg = document.getElementById('modalCnicFrontImg');
    const bImg = document.getElementById('modalCnicBackImg');

    if (user.cnicFront.startsWith('data:image')) {
      fImg.src = user.cnicFront;
    } else {
      fImg.src = 'https://placehold.co/400x250/10b981/ffffff?text=CNIC+Front+Placeholder';
    }

    if (user.cnicBack.startsWith('data:image')) {
      bImg.src = user.cnicBack;
    } else {
      bImg.src = 'https://placehold.co/400x250/10b981/ffffff?text=CNIC+Back+Placeholder';
    }

    this.openModal('modal-cnic-viewer');
  }

  deleteUser(email) {
    if (!confirm(`Are you sure you want to permanently delete user ${email} from the platform? This cannot be undone.`)) return;

    this.users = this.users.filter(u => u.email !== email);
    this.saveData();
    this.showToast('User removed from the system database.', 'success');
    this.renderAdminUsers();
  }

  renderAdminGroups() {
    const groupsContainer = document.getElementById('adminRunningGroupsContainer');
    groupsContainer.innerHTML = '';

    if (this.groups.length === 0) {
      groupsContainer.innerHTML = `<div style="text-align: center; color: var(--text-muted); border: 1.5px dashed var(--card-border); padding: 2rem; border-radius: 12px;">No kameti groups created yet. Use the tool above to add groups.</div>`;
      return;
    }

    this.groups.forEach(g => {
      // Build member list names
      let memberRowsHtml = '';
      if (g.members.length === 0) {
        memberRowsHtml = `<div style="font-size: 0.85rem; color: var(--text-muted); margin-top: 0.5rem;">No members joined yet. (0 / 10)</div>`;
      } else {
        g.members.forEach((email, idx) => {
          const user = this.users.find(u => u.email === email);
          const name = user ? user.name : email;
          
          // Draw rotation status
          let drawingMonthIdx = g.rotation.indexOf(email);
          let drawTag = '';
          if (drawingMonthIdx !== -1) {
            drawTag = `<span class="badge ${drawingMonthIdx + 1 === g.cycleMonth ? 'badge-success' : 'badge-info'}" style="font-size: 0.7rem;">Draw: Month ${drawingMonthIdx + 1}</span>`;
          }

          memberRowsHtml += `
            <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #f1f5f9; padding: 0.4rem 0.5rem; font-size: 0.85rem;">
              <span>${idx + 1}. <strong>${name}</strong> (${email})</span>
              ${drawTag}
            </div>
          `;
        });
      }

      groupsContainer.innerHTML += `
        <div class="glass-panel" style="margin-bottom: 1.5rem;">
          <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1.5px solid rgba(16, 185, 129, 0.1); padding-bottom: 0.5rem; margin-bottom: 1rem;">
            <div>
              <h3 style="color: var(--primary); font-size: 1.25rem;">${g.name}</h3>
              <span style="font-size: 0.78rem; color: var(--text-muted);">ID: <code>${g.id}</code></span>
            </div>
            <div style="text-align: right;">
              <span class="badge ${g.status === 'running' ? 'badge-success' : 'badge-warning'}">${g.status.toUpperCase()}</span>
              <div style="font-size: 0.8rem; margin-top: 0.25rem; font-weight: bold;">Pool Capital: Rs. ${g.amount.toLocaleString()}</div>
            </div>
          </div>
          
          <div style="display: grid; grid-template-columns: 1fr 1.2fr; gap: 2rem;">
            <div>
              <h4 style="font-size: 0.9rem; text-transform: uppercase; color: var(--text-muted); margin-bottom: 0.5rem;">Members Enrolled (${g.members.length} / 10)</h4>
              ${memberRowsHtml}
            </div>
            <div>
              <h4 style="font-size: 0.9rem; text-transform: uppercase; color: var(--text-muted); margin-bottom: 0.5rem;">Group Attributes</h4>
              <div style="display: flex; flex-direction: column; gap: 0.5rem; font-size: 0.85rem;">
                <div><strong>Monthly Member Fee:</strong> Rs. ${(g.monthlyPayment).toLocaleString()} + Rs. 100 Admin Fee</div>
                <div><strong>Current Cycle Month:</strong> Month ${g.cycleMonth} of 10</div>
                <div><strong>Start Date:</strong> ${g.startDate || 'Awaiting Members Fill'}</div>
                
                ${g.status === 'waiting' 
                  ? `<button class="btn btn-outline" style="margin-top: 1rem; padding: 0.5rem;" onclick="app.simulateFillGroup('${g.id}')"><i class="fa-solid fa-wand-magic-sparkles"></i> Auto-Fill with Mock Members</button>`
                  : ''
                }
              </div>
            </div>
          </div>
        </div>
      `;
    });
  }

  handleCreateGroup(event) {
    event.preventDefault();
    const size = parseInt(document.getElementById('createGroupAmount').value);
    const name = document.getElementById('createGroupName').value.trim();

    if (!name) return;

    this.groups.push({
      id: `grp_${Math.random().toString(36).substr(2, 9)}`,
      name: name,
      amount: size,
      monthlyPayment: size / 10,
      members: [],
      status: 'waiting',
      cycleMonth: 1,
      rotation: [],
      startDate: null
    });

    this.saveData();
    this.showToast(`Kameti group "${name}" created successfully!`, 'success');
    document.getElementById('createGroupName').value = '';
    this.renderAdminGroups();
    this.renderPublicGroups();
  }

  renderAdminPayoutControl() {
    // Render urgent next-month payout requests
    const pendingRequests = this.urgentRequests.filter(r => r.status === 'pending');
    const tableBody = document.getElementById('adminUrgentRequestsTable');
    tableBody.innerHTML = '';

    if (pendingRequests.length === 0) {
      tableBody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--text-muted);">No urgent draw requests pending.</td></tr>`;
    } else {
      pendingRequests.forEach(r => {
        const userObj = this.users.find(u => u.email === r.userEmail);
        const groupObj = this.groups.find(g => g.id === r.groupId);

        const userName = userObj ? userObj.name : r.userEmail;
        const groupName = groupObj ? groupObj.name : 'Unknown Group';

        // Find user draw month
        let drawMonthIdx = -1;
        if (groupObj) {
          drawMonthIdx = groupObj.rotation.indexOf(r.userEmail);
        }
        const drawMonthText = drawMonthIdx !== -1 ? `Month ${drawMonthIdx + 1}` : 'N/A';

        tableBody.innerHTML += `
          <tr>
            <td><strong>${userName}</strong><br><span style="font-size: 0.75rem; color: var(--text-muted);">${r.userEmail}</span></td>
            <td>${groupName}</td>
            <td>${drawMonthText}</td>
            <td style="font-size: 0.85rem; max-width: 250px; line-height: 1.4;">${r.reason}</td>
            <td>
              <button class="btn btn-primary" style="padding: 0.35rem 0.65rem; font-size: 0.75rem; margin-right: 0.25rem;" onclick="app.approveUrgentRequest('${r.id}')">Approve Swap</button>
              <button class="btn btn-ghost" style="padding: 0.35rem 0.65rem; font-size: 0.75rem; color: #ef4444;" onclick="app.rejectUrgentRequest('${r.id}')">Reject</button>
            </td>
          </tr>
        `;
      });
    }

    // Render Payout Disbursements History
    const historyTable = document.getElementById('adminPayoutHistoryTable');
    historyTable.innerHTML = '';

    const historicalPayouts = this.transactions.filter(t => t.type === 'payout');
    if (historicalPayouts.length === 0) {
      historyTable.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-muted);">No payout disbursements recorded in ledger.</td></tr>`;
    } else {
      historicalPayouts.reverse().forEach(p => {
        const userObj = this.users.find(u => u.email === p.recipientEmail);
        const groupObj = this.groups.find(g => g.id === p.groupId);

        const recipientName = userObj ? userObj.name : p.recipientEmail;
        const groupName = groupObj ? groupObj.name : 'Unknown Group';

        historyTable.innerHTML += `
          <tr>
            <td>${p.date}</td>
            <td><strong>${recipientName}</strong></td>
            <td>${groupName}</td>
            <td>${p.cycleMonthName}</td>
            <td><strong>Rs. ${p.amount.toLocaleString()}</strong></td>
            <td><code>${p.txid}</code></td>
          </tr>
        `;
      });
    }
  }

  approveUrgentRequest(requestId) {
    const req = this.urgentRequests.find(r => r.id === requestId);
    if (!req) return;

    const group = this.groups.find(g => g.id === req.groupId);
    if (!group) return;

    const userEmail = req.userEmail;
    
    // Logic for Swap Payout Month
    // Current draw month cycle
    const currentDrawMonth = group.cycleMonth;
    const targetMonth = currentDrawMonth + 1; // Swap with next month's scheduled member

    if (targetMonth > 10) {
      this.showToast('Error: Already at final cycle stages, swap unavailable.', 'error');
      return;
    }

    // Find the person currently assigned to draw in target month (Month index targetMonth - 1)
    const currentWinnerEmail = group.rotation[currentDrawMonth - 1]; // Current draw winner
    const targetWinnerEmail = group.rotation[targetMonth - 1]; // Next draw scheduled winner

    // Locate indices of our requester in rotation array
    const requesterIndex = group.rotation.indexOf(userEmail);

    if (requesterIndex === -1) {
      this.showToast('Error: Requester not found in group rotation list.', 'error');
      return;
    }

    // Perform swap between requester draw position and next month draw position
    // e.g. Swap elements at index targetMonth - 1 and index requesterIndex
    const nextMonthIdx = targetMonth - 1;
    
    // Swap elements
    const temp = group.rotation[nextMonthIdx];
    group.rotation[nextMonthIdx] = group.rotation[requesterIndex];
    group.rotation[requesterIndex] = temp;

    req.status = 'approved';
    this.showToast(`Request Approved! Swapped draw order. ${userEmail} will draw next month (Month ${targetMonth}).`, 'success');
    
    this.saveData();
    this.renderAdminPayoutControl();
  }

  rejectUrgentRequest(requestId) {
    const req = this.urgentRequests.find(r => r.id === requestId);
    if (!req) return;

    req.status = 'rejected';
    this.showToast('Urgent draw request rejected.', 'info');
    
    this.saveData();
    this.renderAdminPayoutControl();
  }

  renderAdminSupportDesk() {
    // Populate thread users on the left
    const threadsList = document.getElementById('adminChatThreadsList');
    threadsList.innerHTML = '';

    const chatEmails = Object.keys(this.chats);

    if (chatEmails.length === 0) {
      threadsList.innerHTML = `<div style="text-align: center; color: var(--text-muted); font-size: 0.85rem; padding: 1.5rem;">No active user chats yet.</div>`;
      return;
    }

    chatEmails.forEach(email => {
      const user = this.users.find(u => u.email === email);
      const name = user ? user.name : email;
      const lastMsg = this.chats[email][this.chats[email].length - 1];
      
      const isActive = this.activeAdminChatUser === email ? 'active' : '';

      threadsList.innerHTML += `
        <div class="chat-list-item ${isActive}" onclick="app.selectAdminChatThread('${email}')">
          <div class="chat-avatar">${name.substr(0,1).toUpperCase()}</div>
          <div style="flex: 1; min-width: 0;">
            <h5>${name}</h5>
            <p>${lastMsg ? lastMsg.text : 'No messages yet.'}</p>
          </div>
        </div>
      `;
    });

    if (this.activeAdminChatUser) {
      document.getElementById('adminChatSelectHint').style.display = 'none';
      document.getElementById('adminChatMainBox').style.display = 'flex';
      this.renderAdminChatMessages();
    } else {
      document.getElementById('adminChatSelectHint').style.display = 'flex';
      document.getElementById('adminChatMainBox').style.display = 'none';
    }
  }

  selectAdminChatThread(email) {
    this.activeAdminChatUser = email;
    this.renderAdminSupportDesk();
  }

  renderAdminChatMessages() {
    const chatBody = document.getElementById('adminChatBody');
    chatBody.innerHTML = '';

    const userObj = this.users.find(u => u.email === this.activeAdminChatUser);
    document.getElementById('adminChatHeaderName').innerText = userObj ? userObj.name : this.activeAdminChatUser;
    document.getElementById('adminChatHeaderEmail').innerText = this.activeAdminChatUser;
    document.getElementById('adminChatAvatar').innerText = (userObj ? userObj.name : this.activeAdminChatUser).substr(0,1).toUpperCase();

    const messages = this.chats[this.activeAdminChatUser] || [];
    messages.forEach(m => {
      const cls = m.sender === 'admin' ? 'sent' : 'received';
      const timeStr = m.time.split(' ')[1].substr(0, 5);

      chatBody.innerHTML += `
        <div class="chat-message ${cls}">
          <div>${m.text}</div>
          <div class="timestamp">${timeStr}</div>
        </div>
      `;
    });

    chatBody.scrollTop = chatBody.scrollHeight;
  }

  sendAdminMessage(event) {
    event.preventDefault();
    const inputEl = document.getElementById('adminChatInput');
    const msgText = inputEl.value.trim();
    if (!msgText || !this.activeAdminChatUser) return;

    const email = this.activeAdminChatUser;
    const timestamp = this.formatCurrentTimestamp();
    
    this.chats[email].push({
      sender: 'admin',
      text: msgText,
      time: timestamp
    });

    this.saveData();
    inputEl.value = '';
    this.renderAdminChatMessages();
    
    // Re-render sidebar to update last message preview
    const threadsList = document.getElementById('adminChatThreadsList');
    this.renderAdminSupportDesk();
  }

  renderAdminAIEmails() {
    // Populate user recipient dropdown
    const userSelect = document.getElementById('aiUserSelect');
    if (userSelect) {
      userSelect.innerHTML = '';
      const members = this.users.filter(u => u.role !== 'admin');
      members.forEach(u => {
        userSelect.innerHTML += `<option value="${u.email}">${u.name} (${u.email})</option>`;
      });
    }

    // Pre-populate API Keys input fields
    const geminiInput = document.getElementById('keyGemini');
    const groqInput = document.getElementById('keyGroq');
    if (geminiInput) {
      geminiInput.value = localStorage.getItem('key_gemini') || "Configured on Server";
    }
    if (groqInput) {
      groqInput.value = localStorage.getItem('key_groq') || "Configured on Server";
    }
  }

  saveApiKeys() {
    const gemini = document.getElementById('keyGemini').value.trim();
    const groq = document.getElementById('keyGroq').value.trim();

    localStorage.setItem('key_gemini', gemini);
    localStorage.setItem('key_groq', groq);
    this.showToast('API Keys configuration updated!', 'success');
  }

  // --- Gemini & Groq APIs Trigger ---
  async generateAIEmail() {
    const userEmail = document.getElementById('aiUserSelect').value;
    const triggerTemplate = document.getElementById('aiEmailTemplate').value;
    const provider = document.getElementById('aiModelProvider').value;
    const previewBody = document.getElementById('aiPreviewOutput');

    if (!userEmail) {
      this.showToast('Error: Please select a user first.', 'error');
      return;
    }

    const userObj = this.users.find(u => u.email === userEmail);
    const userGroups = this.groups.filter(g => g.members.includes(userEmail));
    const primaryGroup = userGroups.length > 0 ? userGroups[0] : { name: 'Gold Wealth Builder', amount: 100000, monthlyPayment: 10000 };

    previewBody.innerText = 'Consulting AI model... Please wait...';

    // Construct Contextual prompts
    const promptContext = `
      You are the Kameti Club Assistant, a Rotating Savings and Credit Association platform manager in Pakistan.
      Generate a professional, warm, and clear email in English (incorporating brief polite Roman Urdu phrases where natural) addressed to the following user:
      
      User Details:
      - Name: ${userObj.name}
      - Email: ${userObj.email}
      - WhatsApp: ${userObj.whatsapp}
      - Kameti Group Name: ${primaryGroup.name}
      - Base Kameti Monthly Payment: Rs. ${primaryGroup.monthlyPayment.toLocaleString()}
      - App Service Fee: Rs. 100
      - Late Penalty Fee: Rs. 500 per day if delayed past the 10th.
      - Payout details: ${userObj.payoutMethod} - ${userObj.accTitle} - ${userObj.accNumber} ${userObj.bankName ? `(${userObj.bankName})` : ''}

      Generate an email based on the following specific template trigger: **${triggerTemplate.toUpperCase()}**
      
      Triggers definitions:
      - welcome: Welcome email onboarding the user, detailing their payment obligations, due dates (before the 10th of every month), late overcharges (Rs. 500/day), and safety protocols.
      - late_followup: Urgently but professionally reminding the user that their monthly kameti payment is pending. Explain that delay past the 10th triggers Rs. 500 per day overcharges, and repeated defaults activate legal processes as per the signed terms & conditions.
      - payment_received: Informing the user that their transfer transaction has been verified. Confirm receipt of their monthly kameti and Rs. 100 service fee, detailing the exact amount logged.
      - payout_success: Informing the member that their draw slot has arrived. Confirm that the total pooled kameti funds (e.g. Rs. ${primaryGroup.amount.toLocaleString()}) have been successfully transferred to their registered receiving account, asking them to verify it in their banking app.
      
      Do NOT include markdown headings, just return the raw text block of the email containing Subject and Body. Make it look premium, structured, and friendly.
    `;

    // 1. Call Gemini via backend proxy
    if (provider === 'gemini') {
      try {
        const response = await fetch('/api/gemini', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: promptContext })
        });
        const data = await response.json();
        if (data.text) {
          previewBody.innerText = data.text;
          this.showToast('Custom Email generated via Gemini API (Backend Proxy)!', 'success');
        } else {
          throw new Error(data.error || "Empty response from server");
        }
      } catch (err) {
        console.error(err);
        this.showToast('Gemini API Error: Proxy connection failed.', 'error');
        previewBody.innerText = 'Error calling Gemini API backend proxy.';
      }
    } 
    // 2. Call Groq via backend proxy
    else if (provider === 'groq') {
      try {
        const response = await fetch('/api/groq', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: promptContext })
        });
        const data = await response.json();
        if (data.text) {
          previewBody.innerText = data.text;
          this.showToast('Custom Email generated via Groq API (Backend Proxy)!', 'success');
        } else {
          throw new Error(data.error || "Empty response from server");
        }
      } catch (err) {
        console.error(err);
        this.showToast('Groq API Error: Proxy connection failed.', 'error');
        previewBody.innerText = 'Error calling Groq API backend proxy.';
      }
    } 
    // 3. Fallback Local Templates
    else {
      // Local Template fallback
      const output = this.generateLocalTemplateText(userObj, primaryGroup, triggerTemplate);
      previewBody.innerText = output;
      this.showToast('Custom Email generated using Local Template!', 'success');
    }
  }

  generateLocalTemplateText(user, group, templateType) {
    const senderTitle = "Kameti Operations Team";
    const date = new Date().toLocaleDateString();
    
    if (templateType === 'welcome') {
      return `Subject: Welcome to Kameti Club, ${user.name}!

Dear ${user.name},

Assalam-o-Alaikum! We are thrilled to welcome you to Pakistan's leading Rotating Savings & Credit Platform.

Your profile has been verified successfully. Below are your group attributes and obligations:
- Enrolled Group: ${group.name}
- Total Pool Payout: Rs. ${(group.amount).toLocaleString()}
- Monthly Kameti Deposit: Rs. ${(group.monthlyPayment).toLocaleString()}
- App Maintenance Service Fee: Rs. 100

Important Deadlines & Rules:
1. All deposits must be sent to the Admin's account and logged in the app before the 10th of every month.
2. Late deposits will incur a mandatory penalty fee of Rs. 500 per day.
3. Your payout slot is determined once the group initiates. You will receive the draw value directly in your registered account: ${user.payoutMethod} (${user.accNumber}).

Thank you for choosing Kameti Club for smart, transparent, and digital savings.

Warm regards,
${senderTitle}`;
    } 
    
    else if (templateType === 'late_followup') {
      return `Subject: URGENT: Outstanding Kameti Payment Alert - ${group.name}

Dear ${user.name},

We are writing to notify you that your monthly deposit for the "${group.name}" is now overdue for this cycle.

As per your legally signed agreement during registration:
- Overdue Base Amount: Rs. ${(group.monthlyPayment).toLocaleString()}
- Admin Service Fee: Rs. 100
- Late Payment Penalty: Rs. 500 / day (applied starting the 11th).

Please transfer the amount to the designated coordinates (EasyPaisa/JazzCash/Bank Account) immediately and submit your Transaction ID (TxID) in the payment section of the dashboard to halt further penalty increments.

Important Notice: Failure to pay is a breach of contract under the Electronic Transactions Ordinance 2002. Persistent defaults (exceeding 30 days) will result in the suspension of your account and filing of recovery cases under Section 406/420 of Pakistan Penal Code using your biometric CNIC details.

We request your immediate cooperation.

Sincerely,
${senderTitle}`;
    } 
    
    else if (templateType === 'payment_received') {
      return `Subject: Payment Confirmed - Monthly Kameti Deposit Logged

Dear ${user.name},

Assalam-o-Alaikum. 

We have successfully verified and approved your monthly kameti payment for the "${group.name}".

Payment Summary:
- Received Date: ${date}
- Logged Base Deposit: Rs. ${(group.monthlyPayment).toLocaleString()}
- Maintenance Fee: Rs. 100
- Late Penalty Charges: Rs. 0
- Logged Transaction ID (TxID): Verify inside dashboard

Your payment schedule status has been updated to "Paid" for this month's cycle. Thank you for making your payment on time, helping us keep the rotating circles running smoothly.

Best regards,
${senderTitle}`;
    } 
    
    else if (templateType === 'payout_success') {
      return `Subject: Congratulations! Your Kameti Payout Has Been Disbursed

Dear ${user.name},

Congratulations! Your draw turn has arrived for this cycle of the "${group.name}".

Our finance desk has successfully disbursed the full kameti pool to your registered account:
- Disbursed Amount: Rs. ${(group.amount).toLocaleString()}
- Destination Account: ${user.payoutMethod} | Title: ${user.accTitle}
- Account No: ${user.accNumber} ${user.bankName ? `(${user.bankName})` : ''}

Please verify the deposit in your respective bank/wallet app. If you have any inquiries, feel free to open a ticket in the Support Chat box.

Happy saving and growing with Kameti Club!

Warm regards,
${senderTitle}`;
    }
    
    return '';
  }

  copyAIEmailText() {
    const previewText = document.getElementById('aiPreviewOutput').innerText;
    navigator.clipboard.writeText(previewText);
    this.showToast('Copied email text to clipboard!', 'success');
  }

  simulateEmailSend() {
    const userEmail = document.getElementById('aiUserSelect').value;
    if (!userEmail) return;

    this.showToast(`Simulating Email & WhatsApp delivery to ${userEmail}... Sent!`, 'success');
  }

  renderAdminAnalytics() {
    const totalSavings = this.groups.filter(g => g.status === 'running').reduce((sum, g) => sum + g.amount, 0);
    const serviceFees = this.transactions.filter(t => t.status === 'approved' && t.serviceFee).reduce((sum, t) => sum + t.serviceFee, 0);
    const penalties = this.transactions.filter(t => t.status === 'approved' && t.lateFee).reduce((sum, t) => sum + t.lateFee, 0);
    const activeSavers = this.users.filter(u => u.role !== 'admin').length;
    const suspendedSavers = this.users.filter(u => u.role !== 'admin' && u.status === 'suspended').length;
    const defaultRate = activeSavers > 0 ? ((suspendedSavers / activeSavers) * 100).toFixed(1) : '0';
    
    let expectedPayments = 0;
    this.groups.forEach(g => {
      if (g.status === 'running') {
        expectedPayments += g.members.length * g.cycleMonth;
      }
    });
    const approvedPayments = this.transactions.filter(t => t.status === 'approved' && t.groupId).length;
    const collectionRate = expectedPayments > 0 ? ((approvedPayments / expectedPayments) * 100).toFixed(1) : '100';

    document.getElementById('analyticsTotalSavings').innerText = 'Rs. ' + totalSavings.toLocaleString();
    document.getElementById('analyticsServiceFees').innerText = 'Rs. ' + serviceFees.toLocaleString();
    document.getElementById('analyticsPenalties').innerText = 'Rs. ' + penalties.toLocaleString();
    document.getElementById('analyticsActiveSavers').innerText = activeSavers + ' Members';
    document.getElementById('analyticsDefaultRate').innerText = defaultRate + '%';
    document.getElementById('analyticsCollectionRate').innerText = Math.min(100, parseFloat(collectionRate)).toFixed(1) + '%';

    // Populate defaulted savers table
    const tableBody = document.getElementById('analyticsDefaultedSaversList');
    if (tableBody) {
      tableBody.innerHTML = '';
      const defaultedUsers = this.users.filter(u => u.status === 'suspended' && u.role !== 'admin');
      
      if (defaultedUsers.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding: 2rem;">No defaulted savers in system record. All accounts are compliant!</td></tr>`;
      } else {
        defaultedUsers.forEach(u => {
          const userGroups = this.groups.filter(g => g.members.includes(u.email) && g.status === 'running');
          const groupNames = userGroups.map(g => g.name).join(', ') || 'N/A';
          tableBody.innerHTML += `
            <tr>
              <td><strong>${u.name}</strong></td>
              <td>${u.email}</td>
              <td>${u.payoutMethod}</td>
              <td>${u.whatsapp || 'N/A'}</td>
              <td><span class="badge badge-danger">High Default Risk</span></td>
              <td>
                <button class="btn btn-secondary btn-outline" style="padding: 0.35rem 0.75rem; font-size: 0.75rem;" onclick="app.sendDefaultRecoveryNotice('${u.email}', '${groupNames}')"><i class="fa-solid fa-paper-plane"></i> Send Recovery Notice</button>
              </td>
            </tr>
          `;
        });
      }
    }

    // Fetch and render Visitor Logs & Device / Geolocation Traffic details
    fetch('/api/visits')
    .then(res => res.json())
    .then(logs => {
      // 1. Device Breakdown
      const totalVisits = logs.length;
      if (totalVisits > 0) {
        const mobileCount = logs.filter(l => l.device === 'Mobile').length;
        const desktopCount = logs.filter(l => l.device === 'Desktop').length;
        const tabletCount = logs.filter(l => l.device === 'Tablet').length;

        const mobilePct = ((mobileCount / totalVisits) * 100).toFixed(0);
        const desktopPct = ((desktopCount / totalVisits) * 100).toFixed(0);
        const tabletPct = ((tabletCount / totalVisits) * 100).toFixed(0);

        document.getElementById('trafficMobilePct').innerText = `${mobilePct}% (${mobileCount})`;
        document.getElementById('trafficMobileBar').style.width = `${mobilePct}%`;

        document.getElementById('trafficDesktopPct').innerText = `${desktopPct}% (${desktopCount})`;
        document.getElementById('trafficDesktopBar').style.width = `${desktopPct}%`;

        document.getElementById('trafficTabletPct').innerText = `${tabletPct}% (${tabletCount})`;
        document.getElementById('trafficTabletBar').style.width = `${tabletPct}%`;
      }

      // 2. Geolocation Aggregation (Country & City)
      const geoMap = {};
      logs.forEach(l => {
        const key = `${l.country}||${l.city}`;
        geoMap[key] = (geoMap[key] || 0) + 1;
      });

      const sortedGeo = Object.entries(geoMap)
        .map(([key, count]) => {
          const [country, city] = key.split('||');
          return { country, city, count };
        })
        .sort((a, b) => b.count - a.count);

      const geoTbody = document.getElementById('trafficGeoList');
      if (geoTbody) {
        geoTbody.innerHTML = '';
        if (sortedGeo.length === 0) {
          geoTbody.innerHTML = `<tr><td colspan="3" style="text-align: center; color: var(--text-muted);">No geolocation stats available.</td></tr>`;
        } else {
          sortedGeo.forEach(item => {
            geoTbody.innerHTML += `
              <tr>
                <td><strong>${item.country}</strong></td>
                <td>${item.city}</td>
                <td><span style="font-weight: 700; color: var(--primary);">${item.count}</span></td>
              </tr>
            `;
          });
        }
      }

      // 3. Real-Time Access Logs Table
      const logsTbody = document.getElementById('trafficLogsList');
      if (logsTbody) {
        logsTbody.innerHTML = '';
        if (logs.length === 0) {
          logsTbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-muted);">No access logs available.</td></tr>`;
        } else {
          logs.forEach(l => {
            const formattedTime = new Date(l.timestamp).toLocaleString();
            logsTbody.innerHTML += `
              <tr style="font-family: monospace; font-size: 0.8rem;">
                <td>${formattedTime}</td>
                <td style="color: var(--secondary); font-weight: 600;">${l.ip}</td>
                <td><strong>${l.city}</strong>, ${l.country}</td>
                <td><span class="badge ${l.device === 'Mobile' ? 'badge-info' : l.device === 'Desktop' ? 'badge-success' : 'badge-warning'}">${l.device}</span></td>
                <td>${l.os}</td>
                <td style="max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${l.userAgent}">${l.userAgent}</td>
              </tr>
            `;
          });
        }
      }
    })
    .catch(err => {
      console.error("Failed to load traffic analytics:", err);
    });
  }

  sendDefaultRecoveryNotice(memberEmail, groupName) {
    const user = this.users.find(u => u.email === memberEmail);
    if (!user) return;

    const subject = `URGENT LEGAL NOTICE: Kameti Club Liability Collection`;
    const bodyText = `Dear ${user.name},<br><br>This is an official notice regarding persistent default on your monthly savings contribution for group: <strong>${groupName}</strong>.<br><br>As a registered member, you are obligated under the signed peer saver agreement. Continued failure to clear your dues and accumulated late penalties (Rs. 500 per day past the 10th) will result in the permanent suspension of your profile and escalation to recovery measures using your biometric CNIC verification records.<br><br>Please log in immediately to clear your liabilities and restore access.<br><br>Best regards,<br>Kameti Recovery & Compliance Desk`;
    this.sendRealEmail(memberEmail, subject, bodyText);
    this.showToast(`Legal recovery notice dispatched to ${memberEmail}!`, 'success');
  }

  runAISystemAudit() {
    const resultBox = document.getElementById('aiAuditResult');
    if (!resultBox) return;

    resultBox.innerHTML = '<i class="fa-solid fa-spinner fa-spin" style="margin-right: 0.5rem;"></i> Running system-wide liquidity and default risk audit... Please wait...';

    const totalSavings = this.groups.filter(g => g.status === 'running').reduce((sum, g) => sum + g.amount, 0);
    const serviceFees = this.transactions.filter(t => t.status === 'approved' && t.serviceFee).reduce((sum, t) => sum + t.serviceFee, 0);
    const penalties = this.transactions.filter(t => t.status === 'approved' && t.lateFee).reduce((sum, t) => sum + t.lateFee, 0);
    const activeSavers = this.users.filter(u => u.role !== 'admin').length;
    const suspendedSavers = this.users.filter(u => u.role !== 'admin' && u.status === 'suspended').length;
    const riskRate = activeSavers > 0 ? ((suspendedSavers / activeSavers) * 100).toFixed(1) : '0';

    const prompt = `You are a professional financial compliance auditor. Analyze the following ROSCA (Rotating Savings & Credit Association) tracker state:
    - Circulating Savings Capital: Rs. ${totalSavings.toLocaleString()}
    - System Service Fees Collected: Rs. ${serviceFees.toLocaleString()}
    - Default Penalties Assessed: Rs. ${penalties.toLocaleString()}
    - Total Active Savers: ${activeSavers}
    - Total Delinquent/Suspended Savers: ${suspendedSavers}
    
    Please write a complete, realistic system audit report covering:
    1. Financial Liquidity and Payout Solvency
    2. Credit/Default Risk Analysis (Risk Percentage: ${riskRate}%)
    3. Strict recommendations to recover delinquent funds and minimize defaulting members.
    
    Output standard clean text with simple markdown table or bullet formatting. Do NOT use markdown code blocks or html wrappers. Make it read like a premium corporate financial document.`;

    fetch('/api/gemini', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: prompt })
    })
    .then(res => res.json())
    .then(data => {
      if (data.text) {
        resultBox.innerText = data.text;
        this.showToast('System audit report generated via Gemini!', 'success');
      } else {
        throw new Error("Empty response");
      }
    })
    .catch(err => {
      console.warn("Gemini audit query failed, trying Groq proxy:", err);
      fetch('/api/groq', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: prompt })
      })
      .then(res => res.json())
      .then(data => {
        if (data.text) {
          resultBox.innerText = data.text;
          this.showToast('System audit report generated via Groq!', 'success');
        } else {
          throw new Error("Empty response");
        }
      })
      .catch(err2 => {
        console.error("All AI proxies failed for audit:", err2);
        // Fallback local report
        resultBox.innerHTML = `<strong>ROSCA SYSTEM AUDIT SUMMARY (LOCAL GENERATION)</strong>\n=========================================\n\n1. LIQUIDITY & SOLVENCY ASSESSMENT\nCirculating capital remains stable at Rs. ${totalSavings.toLocaleString()}. Capital payout reserves are fully funded by peer-saver pool obligations. Solvency risk is low.\n\n2. DEFAULT RISK EVALUATION\nSystem default rate stands at ${riskRate}%. Delinquent savers represent outstanding liabilities which impact other saver slots in the cycle. Account suspension policies are active.\n\n3. ACTIONABLE COMPLIANCE RECOMMENDATIONS\n- Deploy daily AI-generated email reminders to active unpaid accounts before the 10th.\n- Dispatch recovery warnings to suspended accounts using the legal recovered notice desk.`;
        this.showToast('AI offline: Local audit summary report generated.', 'info');
      });
    });
  }

  wrapInPremiumTemplate(subject, bodyText) {
    let formattedBody = bodyText;
    if (bodyText.includes('verification OTP code is:')) {
      const match = bodyText.match(/verification OTP code is:\s*<strong>(\d+)<\/strong>/i);
      if (match) {
        const otpCode = match[1];
        formattedBody = bodyText.replace(/verification OTP code is:\s*<strong>(\d+)<\/strong>/i, `
          <div class="highlight-box">
            <div style="font-size: 13px; font-weight: 600; text-transform: uppercase; color: #64748b; text-align: center; margin-bottom: 5px; letter-spacing: 0.5px;">Your Verification OTP Code</div>
            <div class="otp-code">${otpCode}</div>
          </div>
        `);
      }
    } else if (bodyText.includes('automatically suspended')) {
      formattedBody = bodyText.replace(/(Please contact the support desk or clear your outstanding payments to restore access\.)/i, `
        <div class="highlight-box" style="border-left-color: #ef4444; background-color: rgba(239, 68, 68, 0.05); color: #b91c1c;">
          <strong>⚠️ Action Required:</strong><br>
          Please contact the support desk or clear your outstanding payments to restore access.
        </div>
      `);
    } else if (bodyText.includes('auto-disbursed')) {
      const amountMatch = bodyText.match(/Rs\.\s*([\d,]+)/);
      const txMatch = bodyText.match(/Transaction ID:\s*<strong>(\w+)<\/strong>/i);
      let highlights = '';
      if (amountMatch) highlights += `<strong>💰 Disbursed Amount:</strong> Rs. ${amountMatch[1]}<br>`;
      if (txMatch) highlights += `<strong>🔗 Transaction ID:</strong> ${txMatch[1]}<br>`;
      
      if (highlights) {
        formattedBody = bodyText.replace(/(We are pleased to inform you that your monthly pool payout[\s\S]*?successfully auto-disbursed to your registered account\.)/i, `$1<div class="highlight-box">${highlights}</div>`);
      }
    }

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
  <style>
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background-color: #f8fafc;
      color: #0f172a;
      margin: 0;
      padding: 0;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }
    .email-wrapper {
      width: 100%;
      background-color: #f8fafc;
      padding: 40px 20px;
      box-sizing: border-box;
    }
    .email-card {
      max-width: 600px;
      margin: 0 auto;
      background: #ffffff;
      border: 1px solid rgba(16, 185, 129, 0.08);
      border-radius: 16px;
      overflow: hidden;
      box-shadow: 0 10px 15px -3px rgba(16, 185, 129, 0.04), 0 4px 6px -2px rgba(16, 185, 129, 0.02);
    }
    .email-header {
      background: linear-gradient(135deg, #10b981 0%, #0ea5e9 100%);
      padding: 30px;
      text-align: center;
    }
    .email-header h1 {
      color: #ffffff;
      margin: 0;
      font-size: 24px;
      font-weight: 800;
      letter-spacing: -0.5px;
    }
    .email-body {
      padding: 40px 30px;
      line-height: 1.6;
      font-size: 15px;
    }
    .email-body p {
      margin: 0 0 20px 0;
      color: #475569;
    }
    .email-body p:last-child {
      margin-bottom: 0;
    }
    .highlight-box {
      background-color: rgba(16, 185, 129, 0.05);
      border-left: 4px solid #10b981;
      padding: 20px;
      border-radius: 8px;
      margin: 25px 0;
      font-size: 14px;
      line-height: 1.5;
    }
    .otp-code {
      font-size: 32px;
      font-weight: 800;
      letter-spacing: 6px;
      color: #10b981;
      text-align: center;
      margin: 15px 0;
    }
    .email-footer {
      background-color: #f1f5f9;
      padding: 20px 30px;
      text-align: center;
      font-size: 12px;
      color: #64748b;
      border-top: 1px solid #e2e8f0;
    }
    .email-footer a {
      color: #10b981;
      text-decoration: none;
      font-weight: 600;
    }
    @media only screen and (max-width: 600px) {
      .email-wrapper {
        padding: 20px 10px;
      }
      .email-body {
        padding: 30px 20px;
      }
      .email-header {
        padding: 20px;
      }
    }
  </style>
</head>
<body>
  <div class="email-wrapper">
    <div class="email-card">
      <div class="email-header">
        <h1>Kameti Club</h1>
      </div>
      <div class="email-body">
        ${formattedBody}
      </div>
      <div class="email-footer">
        &copy; 2026 Kameti Club. All Rights Reserved.<br>
        Pakistan's Premium P2P Committee Coordinator. <a href="https://kameti-club.vercel.app">Access Portal</a>
      </div>
    </div>
  </div>
</body>
</html>`;
  }

  sendRealEmail(toEmail, subject, body) {
    const htmlBody = this.wrapInPremiumTemplate(subject, body);
    
    fetch('/api/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: toEmail,
        subject: subject,
        body: htmlBody
      })
    })
    .then(response => response.json())
    .then(data => {
      if (data.success) {
        console.log(`Real email sent to ${toEmail} successfully via Secure Node.js Backend.`);
      } else {
        console.error("Secure Node.js Backend failed to send email:", data.error);
        this.showToast(`Email Delivery Error: ${data.error || 'Check server logs'}`, 'error');
      }
    })
    .catch(err => {
      console.error("Error calling secure send-email API:", err);
      this.showToast('Network error: Failed to connect to secure email dispatcher.', 'error');
    });
  }

  generateAndSendAIReminder(user, group, cycleMonthName) {
    const prompt = `You are the Kameti Club Assistant (Pakistan P2P savings platform coordinator).
    Generate a polite, clear, and professional daily payment reminder email in English (incorporating natural, polite Roman Urdu phrases where appropriate) addressed to:
    - Member Name: ${user.name}
    - Group Name: ${group.name}
    - Base Monthly Payment: Rs. ${group.monthlyPayment.toLocaleString()}
    - Cycle Month: ${cycleMonthName}
    - Due Date: Before the 10th of this month.
    
    Please remind them to log in to the portal and submit their manual payment proof to avoid auto-suspension (which triggers on the 10th at 10:00 AM PKT with a Rs. 500/day overcharge penalty).
    Keep it friendly but clear. Do NOT include markdown headings, just return the plain email text containing Subject and Body.`;

    // Fetch AI response via backend proxy
    fetch('/api/gemini', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: prompt })
    })
    .then(res => res.json())
    .then(data => {
      let emailBodyText = '';
      if (data.text) {
        emailBodyText = data.text;
        console.log("Daily payment reminder generated via Gemini API.");
      } else {
        throw new Error("No Gemini response");
      }
      this.sendRealEmail(user.email, `Payment Reminder: ${group.name}`, emailBodyText);
    })
    .catch(err => {
      console.warn("Gemini API failed for reminder email, falling back to Groq:", err);
      fetch('/api/groq', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: prompt })
      })
      .then(res => res.json())
      .then(data => {
        let emailBodyText = '';
        if (data.text) {
          emailBodyText = data.text;
          console.log("Daily payment reminder generated via Groq API.");
        } else {
          throw new Error("No Groq response");
        }
        this.sendRealEmail(user.email, `Payment Reminder: ${group.name}`, emailBodyText);
      })
      .catch(err2 => {
        console.error("All AI API endpoints failed for reminder, using local template fallback:", err2);
        const bodyText = `Dear ${user.name},<br><br>This is a daily reminder that your monthly payment of <strong>Rs. ${group.monthlyPayment.toLocaleString()}</strong> for group <strong>${group.name}</strong> (${cycleMonthName}) is pending.<br><br>Please log in to the Kameti Club portal and submit your transaction receipt before the 10th of the month to keep your account active and avoid any penalties.<br><br>Best regards,<br>Kameti Club Team`;
        this.sendRealEmail(user.email, `Payment Reminder: ${group.name}`, bodyText);
      });
    });
  }

  // --- Modals ---
  openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.classList.add('open');
    }
  }

  closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.classList.remove('open');
    }
  }

  // --- Helper Upload UI handler ---
  setupUploadHandlers() {
    // Front upload preview
    const fInput = document.getElementById('cnicFrontFile');
    if (fInput) {
      fInput.parentElement.addEventListener('dragover', (e) => {
        e.preventDefault();
        fInput.parentElement.style.borderColor = 'var(--primary)';
      });
      fInput.parentElement.addEventListener('dragleave', () => {
        fInput.parentElement.style.borderColor = 'rgba(16, 185, 129, 0.25)';
      });
    }
    
    // Back upload preview
    const bInput = document.getElementById('cnicBackFile');
    if (bInput) {
      bInput.parentElement.addEventListener('dragover', (e) => {
        e.preventDefault();
        bInput.parentElement.style.borderColor = 'var(--primary)';
      });
      bInput.parentElement.addEventListener('dragleave', () => {
        bInput.parentElement.style.borderColor = 'rgba(16, 185, 129, 0.25)';
      });
    }
  }

  // --- Toast notifications ---
  showToast(message, type = 'success') {
    const toast = document.getElementById('toastBox');
    const msgEl = document.getElementById('toastMessage');
    
    msgEl.innerText = message;
    toast.className = `toast show ${type}`;
    
    // Update toast icon based on type
    const icon = toast.querySelector('i');
    if (type === 'success') {
      icon.className = 'fa-solid fa-circle-check';
    } else if (type === 'error') {
      icon.className = 'fa-solid fa-triangle-exclamation';
    } else {
      icon.className = 'fa-solid fa-circle-info';
    }

    setTimeout(() => {
      toast.classList.remove('show');
    }, 4000);
  }
  // --- Simulated Time Actions ---
  applySimulatedTime() {
    const inputVal = document.getElementById('simulatedClockInput').value;
    if (!inputVal) {
      this.showToast('Error: Please select a valid simulated date & time.', 'error');
      return;
    }
    
    this.simulatedTime = new Date(inputVal);
    this.showToast(`Simulated system time set to: ${inputVal}`, 'success');
    this.checkTimeBasedTriggers(this.simulatedTime);
  }

  resetSimulatedTime() {
    this.simulatedTime = null;
    this.showToast('System clock reset to real-time.', 'success');
    
    // Reset view clock formatting
    this.renderAdminOverview();
  }

  checkTimeBasedTriggers(now) {
    const day = now.getDate();
    const hour = now.getHours();

    let stateChanged = false;
    let toastMessages = [];

    // Trigger 1: Auto-Suspension at 10:00 AM on the 10th of the month
    if (day === 10 && hour >= 10) {
      // Find all active running groups
      this.groups.forEach(g => {
        if (g.status === 'running') {
          const currentCycleMonthName = `Month ${g.cycleMonth}`;
          
          g.members.forEach(memberEmail => {
            // Skip checking if they already paid or are already suspended
            const hasPaid = this.transactions.some(t => 
              t.userEmail === memberEmail && 
              t.groupId === g.id && 
              t.cycleMonthName === currentCycleMonthName && 
              t.status === 'approved'
            );
            
            if (!hasPaid) {
              // Suspend user
              const userObj = this.users.find(u => u.email === memberEmail);
              if (userObj && userObj.status !== 'suspended') {
                userObj.status = 'suspended';
                stateChanged = true;
                toastMessages.push(`Member ${userObj.name} suspended for non-payment.`);
                
                // Add alert notification to chat
                if (!this.chats[memberEmail]) this.chats[memberEmail] = [];
                this.chats[memberEmail].push({
                  sender: 'admin',
                  text: `⚠️ ACCOUNT SUSPENDED: Your account has been automatically suspended on the 10th at 10:00 AM PKT for non-payment of your monthly due (Rs. ${(g.monthlyPayment + 100).toLocaleString()}) in "${g.name}". Contact support to clear liabilities.`,
                  time: this.formatCurrentTimestamp()
                });

                // Send real email alert
                const subject = `Kameti Club Account Suspended - ${g.name}`;
                const bodyText = `Dear Saver,<br><br>Your Kameti Club account has been automatically suspended due to non-payment of dues for <strong>${g.name}</strong> (Month Cycle: ${currentCycleMonthName}).<br><br>Please contact the support desk or clear your outstanding payments to restore access.<br><br>Best regards,<br>Kameti Club Team`;
                this.sendRealEmail(memberEmail, subject, bodyText);
              }
            }
          });
        }
      });
    }

    // Trigger 3: Daily Auto-Reminder to unpaid members (runs before the 10th of the month)
    if (day < 10) {
      const dateKey = now.toISOString().split('T')[0];
      this.groups.forEach(g => {
        if (g.status === 'running') {
          const currentCycleMonthName = `Month ${g.cycleMonth}`;
          
          g.members.forEach(memberEmail => {
            // Check if they already paid
            const hasPaid = this.transactions.some(t => 
              t.userEmail === memberEmail && 
              t.groupId === g.id && 
              t.cycleMonthName === currentCycleMonthName && 
              t.status === 'approved'
            );
            
            if (!hasPaid) {
              // Check if reminder was already sent for today
              const logKey = `${g.id}-${g.cycleMonth}-${memberEmail}-${dateKey}`;
              if (!this.reminderLogs) this.reminderLogs = {};
              
              if (!this.reminderLogs[logKey]) {
                this.reminderLogs[logKey] = true;
                stateChanged = true;
                
                const userObj = this.users.find(u => u.email === memberEmail);
                if (userObj) {
                  this.generateAndSendAIReminder(userObj, g, currentCycleMonthName);
                }
              }
            }
          });
        }
      });
    }

    // Trigger 2: Auto-Disbursement at 11:00 AM on the 10th of the month
    if (day === 10 && hour >= 11) {
      this.groups.forEach(g => {
        if (g.status === 'running') {
          const currentCycleMonthName = `Month ${g.cycleMonth}`;
          const winnerEmail = g.rotation[g.cycleMonth - 1];

          if (winnerEmail) {
            // Check if payout already processed
            const payoutExists = this.transactions.some(t => 
              t.type === 'payout' && 
              t.groupId === g.id && 
              t.cycleMonthName === currentCycleMonthName
            );

            if (!payoutExists) {
              // Process auto disbursement
              const payoutAmount = g.amount;
              const generatedTxid = 'auto_pay_tx_' + Math.floor(100000 + Math.random() * 900000);
              
              this.transactions.push({
                id: `payout_auto_${Math.random().toString(36).substr(2, 9)}`,
                type: 'payout',
                recipientEmail: winnerEmail,
                groupId: g.id,
                cycleMonthName: currentCycleMonthName,
                amount: payoutAmount,
                txid: generatedTxid,
                date: now.toISOString().split('T')[0]
              });

              // Advance group cycle
              if (g.cycleMonth >= 10) {
                g.status = 'completed';
              } else {
                g.cycleMonth += 1;
              }

              stateChanged = true;
              const winnerUser = this.users.find(u => u.email === winnerEmail);
              const winnerName = winnerUser ? winnerUser.name : winnerEmail;
              toastMessages.push(`Auto-disbursed Rs. ${payoutAmount.toLocaleString()} to ${winnerName}.`);

              // Notify winner via chat
              if (!this.chats[winnerEmail]) this.chats[winnerEmail] = [];
              this.chats[winnerEmail].push({
                sender: 'admin',
                text: `🎉 CONGRATULATIONS! Your kameti draw turn has arrived! Rs. ${payoutAmount.toLocaleString()} has been auto-disbursed to your registered ${winnerUser ? winnerUser.payoutMethod : 'account'} on the 10th at 11:00 AM PKT. TxID: ${generatedTxid}.`,
                time: this.formatCurrentTimestamp()
              });

              // Send real payout email
              const subject = `Kameti Club - Payout Disbursed!`;
              const bodyText = `Dear Saver,<br><br>We are pleased to inform you that your monthly pool payout of <strong>Rs. ${payoutAmount.toLocaleString()}</strong> for group <strong>${g.name}</strong> has been successfully auto-disbursed to your registered account.<br><br>Transaction ID: <strong>${generatedTxid}</strong><br><br>Thank you for saving and growing with Kameti Club!<br><br>Best regards,<br>Kameti Club Team`;
              this.sendRealEmail(winnerEmail, subject, bodyText);
            }
          }
        }
      });
    }

    if (stateChanged) {
      this.saveData();
      toastMessages.forEach(msg => this.showToast(msg, 'info'));
      
      // Re-render active view
      if (this.currentView === 'admin-dashboard') {
        this.renderAdminDashboard();
      } else if (this.currentView === 'user-dashboard') {
        this.renderUserDashboard();
      }
    }
  }

  // Same trigger running inside tick
  checkTimeBasedTriggersTick(now) {
    // Only fire exactly at the top of 10:00 AM or 11:00 AM PKT
    const day = now.getDate();
    const hour = now.getHours();
    const minute = now.getMinutes();
    const second = now.getSeconds();

    if (day === 10 && second === 0) {
      if (hour === 10 && minute === 0) {
        this.checkTimeBasedTriggers(now);
      }
      if (hour === 11 && minute === 0) {
        this.checkTimeBasedTriggers(now);
      }
    }
  }
}

// Instantiate
const app = new KametiApp();


