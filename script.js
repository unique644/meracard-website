/* MeraCard: puri website ka JavaScript (frontend demo)
   -------------------------------------------------------------
   Abhi saara data browser ke localStorage mein save hota hai, taaki
   bina backend ke website chal sake. Baad mein hum "STORAGE" wale
   hisse ko server + database se badal denge.

   Is file ke hisse:
   1. Settings
   2. STORAGE (data save / read)
   3. Chhote helper functions
   4. Card ka design aur QR code
   5. Menu aur page badalna (router)
   6. Register / Login / Logout
   7. Member dashboard (card, documents, profile)
   8. Admin dashboard
   9. Start
*/
(function () {
  'use strict';

  /* ============ 1. SETTINGS ============ */
  const KEY_USERS = 'meracard_users';
  const KEY_DOCS = 'meracard_docs';
  const KEY_SESSION = 'meracard_session';
  const MAX_FILE_BYTES = 1.5 * 1024 * 1024; // 1.5 MB per file (browser storage chhota hota hai)
  const MAX_DOCS = 10;
  const ROUTES = ['home', 'register', 'login', 'dashboard', 'admin'];
  const ADMIN_EMAIL = 'admin@meracard.in';
  const ADMIN_PASSWORD = 'Admin@123';
  const SAMPLE_PASSWORD = 'Demo@123';

  /* ============ 2. STORAGE ============ */
  // Agar browser localStorage allow nahi karta, to data sirf memory mein rehta hai.
  const memory = {};
  let useMemory = false;
  try {
    localStorage.setItem('__meracard_test', '1');
    localStorage.removeItem('__meracard_test');
  } catch (e) {
    useMemory = true;
  }

  const store = {
    get(key, fallback) {
      try {
        const raw = useMemory ? memory[key] : localStorage.getItem(key);
        return raw == null ? fallback : JSON.parse(raw);
      } catch (e) {
        return fallback;
      }
    },
    set(key, value) {
      try {
        const raw = JSON.stringify(value);
        if (useMemory) memory[key] = raw;
        else localStorage.setItem(key, raw);
        return true;
      } catch (e) {
        return false; // aksar storage full hone par
      }
    },
    remove(key) {
      try {
        if (useMemory) delete memory[key];
        else localStorage.removeItem(key);
      } catch (e) { /* ignore */ }
    }
  };

  const getUsers = () => store.get(KEY_USERS, []);
  const saveUsers = (list) => store.set(KEY_USERS, list);
  const getDocs = (userId) => (store.get(KEY_DOCS, {})[userId] || []);
  function saveDocs(userId, list) {
    const all = store.get(KEY_DOCS, {});
    all[userId] = list;
    return store.set(KEY_DOCS, all);
  }
  function removeDocs(userId) {
    const all = store.get(KEY_DOCS, {});
    delete all[userId];
    store.set(KEY_DOCS, all);
  }
  const getSessionId = () => store.get(KEY_SESSION, null);
  const setSession = (id) => store.set(KEY_SESSION, id);
  const clearSession = () => store.remove(KEY_SESSION);

  function currentUser() {
    const id = getSessionId();
    if (!id) return null;
    const user = getUsers().find((u) => u.id === id);
    if (!user) return null;
    if (user.role !== 'admin' && user.status !== 'approved') return null;
    return user;
  }

  /* ============ 3. HELPERS ============ */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  // User ka likha text HTML mein daalne se pehle safe banata hai
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));

  const uid = (prefix) => prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  const initials = (name) => String(name || '?').trim().split(/\s+/).slice(0, 2)
    .map((w) => w.charAt(0)).join('').toUpperCase() || '?';

  function formatBytes(n) {
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(0) + ' KB';
    return (n / 1024 / 1024).toFixed(1) + ' MB';
  }

  function formatDate(iso) {
    try {
      return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch (e) {
      return '';
    }
  }

  const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString();

  async function hashPassword(password) {
    // Demo ke liye. Asli website mein password server par bcrypt/argon2 se hash hoga.
    const text = 'meracard:' + password;
    try {
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
      return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
    } catch (e) {
      let h = 5381;
      for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) >>> 0;
      return 'x' + h.toString(16);
    }
  }

  function newCardNo(users) {
    const used = new Set(users.map((u) => u.cardNo));
    let no;
    do {
      no = 'MC-' + new Date().getFullYear() + '-' + String(Math.floor(Math.random() * 900000) + 100000);
    } while (used.has(no));
    return no;
  }

  let toastTimer;
  function toast(message) {
    const t = $('#toast');
    t.textContent = message;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 3500);
  }

  // Delete jaise kaam se pehle "pakka?" poochne wala box
  function confirmDialog({ title, text, okLabel = 'Delete', danger = true }) {
    return new Promise((resolve) => {
      const modal = $('#modal');
      const ok = $('#modalOk');
      const cancel = $('#modalCancel');
      $('#modalTitle').textContent = title;
      $('#modalText').textContent = text;
      ok.textContent = okLabel;
      ok.className = 'btn ' + (danger ? 'btn-danger' : 'btn-primary');
      modal.hidden = false;
      cancel.focus();

      function close(answer) {
        modal.hidden = true;
        ok.removeEventListener('click', onOk);
        cancel.removeEventListener('click', onCancel);
        modal.removeEventListener('click', onBackdrop);
        document.removeEventListener('keydown', onKey);
        resolve(answer);
      }
      const onOk = () => close(true);
      const onCancel = () => close(false);
      const onBackdrop = (e) => { if (e.target === modal) close(false); };
      const onKey = (e) => { if (e.key === 'Escape') close(false); };
      ok.addEventListener('click', onOk);
      cancel.addEventListener('click', onCancel);
      modal.addEventListener('click', onBackdrop);
      document.addEventListener('keydown', onKey);
    });
  }

  function copyText(text, doneMessage) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text)
        .then(() => toast(doneMessage))
        .catch(() => toast('Copy was blocked here. Select the text and copy it by hand.'));
    } else {
      toast('Copy is not available here. Select the text and copy it by hand.');
    }
  }

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  const PHONE_RE = /^[6-9]\d{9}$/;
  function cleanPhone(value) {
    let digits = String(value).replace(/\D/g, '');
    if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
    return digits;
  }

  // Form ke neeche laal error likhta hai. true deta hai agar koi error mili.
  function showErrors(form, errors) {
    $$('.error', form).forEach((p) => { p.textContent = ''; });
    $$('input', form).forEach((i) => i.classList.remove('invalid'));
    const keys = Object.keys(errors);
    keys.forEach((id) => {
      const p = $('[data-error-for="' + id + '"]', form);
      if (p) p.textContent = errors[id];
      const input = $('#' + id, form);
      if (input) input.classList.add('invalid');
    });
    if (keys.length) {
      const first = $('#' + keys[0], form);
      if (first) first.focus();
    }
    return keys.length > 0;
  }

  // Photo ko square (320x320) mein kaat kar chhota karta hai
  function photoToSquare(file, size = 320) {
    return new Promise((resolve, reject) => {
      if (!/^image\/(jpeg|png)$/.test(file.type)) {
        reject(new Error('Please choose a JPG or PNG photo.'));
        return;
      }
      if (file.size > 8 * 1024 * 1024) {
        reject(new Error('This photo is too big. Choose one under 8 MB.'));
        return;
      }
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Could not read this photo.'));
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error('Could not open this photo.'));
        img.onload = () => {
          const side = Math.min(img.width, img.height);
          const sx = (img.width - side) / 2;
          const sy = (img.height - side) / 2;
          const canvas = document.createElement('canvas');
          canvas.width = size;
          canvas.height = size;
          canvas.getContext('2d').drawImage(img, sx, sy, side, side, 0, 0, size, size);
          resolve(canvas.toDataURL('image/jpeg', 0.85));
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  function showPhotoPreview(previewId, url) {
    $('#' + previewId).innerHTML = url
      ? '<img src="' + esc(url) + '" alt="Photo preview">'
      : '<span>Photo</span>';
  }

  function bindPhotoPicker(inputId, previewId, onPhoto) {
    const input = $('#' + inputId);
    input.addEventListener('change', async () => {
      const file = input.files[0];
      if (!file) return;
      try {
        const url = await photoToSquare(file);
        onPhoto(url);
        showPhotoPreview(previewId, url);
      } catch (err) {
        toast(err.message);
      }
      input.value = '';
    });
  }

  function avatarHTML(user, cls) {
    return user.photo
      ? '<img class="' + cls + '" src="' + esc(user.photo) + '" alt="">'
      : '<span class="' + cls + ' avatar-fallback" aria-hidden="true">' + esc(initials(user.name)) + '</span>';
  }

  const SVG_USE = (id) => '<svg class="icon"><use href="#' + id + '"/></svg>';

  /* ============ 4. CARD DESIGN AUR QR CODE ============ */
  function qrText(user) {
    return 'MeraCard\nCard No: ' + user.cardNo + '\nName: ' + user.name;
  }

  function makeQR(box, text) {
    box.innerHTML = '';
    if (typeof QRCode === 'undefined') {
      box.innerHTML = '<span class="qr-missing">QR needs internet the first time it loads</span>';
      return;
    }
    try {
      const temp = document.createElement('div');
      new QRCode(temp, { text: text, width: 256, height: 256, colorDark: '#0B1A22', colorLight: '#ffffff', correctLevel: QRCode.CorrectLevel.M });
      const canvas = temp.querySelector('canvas');
      const img = document.createElement('img');
      img.alt = 'QR code for card';
      img.src = canvas.toDataURL('image/png');
      box.appendChild(img);
    } catch (e) {
      box.innerHTML = '<span class="qr-missing">Could not make the QR code</span>';
    }
  }

  function cardHTML(u) {
    const photo = u.photo
      ? '<img class="card-photo" src="' + esc(u.photo) + '" alt="Photo of ' + esc(u.name) + '">'
      : '<div class="card-photo card-photo-empty" aria-hidden="true">' + esc(initials(u.name)) + '</div>';
    const role = (u.title || 'Member') + (u.city ? ' · ' + u.city : '');
    return '' +
      '<div class="card-wrap"><div class="card3d" tabindex="0" role="button" aria-pressed="false" aria-label="Digital card of ' + esc(u.name) + '. Press to flip.">' +
        '<div class="card-inner">' +
          '<div class="card-face card-front">' +
            '<div class="card-head"><span class="card-brand">' + SVG_USE('i-card') + 'MeraCard</span>' +
              '<span class="card-badge">' + (u.status === 'approved' ? 'Verified' : 'Pending') + '</span></div>' +
            '<div class="card-main">' + photo +
              '<div class="card-id"><h3 class="card-name">' + esc(u.name) + '</h3><p class="card-role">' + esc(role) + '</p></div></div>' +
            '<div class="card-foot"><div><span class="card-label">Card no.</span><span class="card-no">' + esc(u.cardNo) + '</span></div>' +
              '<span class="card-flip-hint">Tap to flip</span></div>' +
          '</div>' +
          '<div class="card-face card-back">' +
            '<div class="qr-box"></div>' +
            '<p class="card-scan">Scan to check this card</p>' +
            '<p class="card-no card-no-back">' + esc(u.cardNo) + '</p>' +
          '</div>' +
        '</div>' +
      '</div></div>';
  }

  function mountCard(container, user) {
    container.innerHTML = cardHTML(user);
    const card = $('.card3d', container);
    const flip = () => {
      card.classList.toggle('flipped');
      card.setAttribute('aria-pressed', String(card.classList.contains('flipped')));
    };
    card.addEventListener('click', flip);
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); flip(); }
    });
    makeQR($('.qr-box', container), qrText(user));
  }

  const SAMPLE_CARD_USER = {
    name: 'Aarav Sharma', title: 'Product Designer', city: 'Pune',
    cardNo: 'MC-2026-048213', photo: '', status: 'approved'
  };

  /* ============ 5. MENU AUR PAGE BADALNA ============ */
  function renderNav() {
    const u = currentUser();
    let html = '<a class="nav-link hide-sm" href="#home">Home</a>';
    if (!u) {
      html += '<a class="btn btn-ghost btn-sm" href="#login">Login</a>' +
              '<a class="btn btn-primary btn-sm" href="#register">Register</a>';
    } else {
      const isAdmin = u.role === 'admin';
      html += '<a class="nav-link" href="' + (isAdmin ? '#admin' : '#dashboard') + '">' + (isAdmin ? 'Admin' : 'My card') + '</a>' +
              '<button class="btn btn-ghost btn-sm" type="button" data-action="logout">Logout</button>';
    }
    $('#nav').innerHTML = html;
  }

  function redirect(name) { location.hash = '#' + name; }

  function route() {
    let name = (location.hash || '#home').slice(1);
    if (!ROUTES.includes(name)) name = 'home';
    const u = currentUser();

    if (name === 'dashboard') {
      if (!u) return redirect('login');
      if (u.role === 'admin') return redirect('admin');
    }
    if (name === 'admin' && (!u || u.role !== 'admin')) return redirect('login');
    if ((name === 'login' || name === 'register') && u) return redirect(u.role === 'admin' ? 'admin' : 'dashboard');

    $$('.view').forEach((v) => v.classList.toggle('active', v.id === 'view-' + name));
    renderNav();

    if (name === 'register') {
      $('#registerForm').hidden = false;
      $('#registerDone').hidden = true;
    }
    if (name === 'login') {
      $('#loginMsg').hidden = true;
    }
    if (name === 'dashboard') renderDashboard();
    if (name === 'admin') renderAdmin();
    window.scrollTo(0, 0);
  }

  function logout() {
    clearSession();
    renderNav();
    if ((location.hash || '#home') === '#home') route();
    else redirect('home');
    toast('You are logged out.');
  }

  /* ============ 6. REGISTER / LOGIN ============ */
  let regPhoto = '';

  async function onRegister(e) {
    e.preventDefault();
    const form = e.currentTarget;
    const v = {
      name: $('#regName').value.trim(),
      email: $('#regEmail').value.trim().toLowerCase(),
      phone: cleanPhone($('#regPhone').value),
      title: $('#regTitle').value.trim(),
      city: $('#regCity').value.trim(),
      password: $('#regPassword').value,
      confirm: $('#regConfirm').value
    };
    const users = getUsers();
    const errors = {};
    if (v.name.length < 2) errors.regName = 'Enter your full name.';
    if (!EMAIL_RE.test(v.email)) errors.regEmail = 'Enter a valid email address.';
    else if (users.some((u) => u.email === v.email)) errors.regEmail = 'This email is already registered. Try logging in.';
    if (!PHONE_RE.test(v.phone)) errors.regPhone = 'Enter a 10 digit mobile number.';
    if (v.password.length < 8 || !/[A-Za-z]/.test(v.password) || !/\d/.test(v.password)) {
      errors.regPassword = 'Use 8 or more characters with at least one letter and one number.';
    }
    if (v.confirm !== v.password) errors.regConfirm = 'The two passwords do not match.';
    if (showErrors(form, errors)) return;

    const user = {
      id: uid('u'),
      role: 'user',
      status: 'pending',
      name: v.name,
      email: v.email,
      phone: v.phone,
      title: v.title,
      city: v.city,
      photo: regPhoto,
      passwordHash: await hashPassword(v.password),
      cardNo: newCardNo(users),
      createdAt: new Date().toISOString()
    };
    users.push(user);
    if (!saveUsers(users)) {
      toast('Browser storage is full. Try a smaller photo.');
      return;
    }
    form.reset();
    regPhoto = '';
    showPhotoPreview('regPhotoPreview', '');
    showErrors(form, {});
    form.hidden = true;
    $('#registerDoneNo').textContent = user.cardNo;
    $('#registerDone').hidden = false;
    window.scrollTo(0, 0);
  }

  function showLoginMessage(text, kind) {
    const box = $('#loginMsg');
    box.textContent = text;
    box.className = 'notice' + (kind ? ' ' + kind : '');
    box.hidden = false;
  }

  async function onLogin(e) {
    e.preventDefault();
    const form = e.currentTarget;
    const email = $('#loginEmail').value.trim().toLowerCase();
    const password = $('#loginPassword').value;
    const errors = {};
    if (!EMAIL_RE.test(email)) errors.loginEmail = 'Enter your email address.';
    if (!password) errors.loginPassword = 'Enter your password.';
    if (showErrors(form, errors)) return;

    const user = getUsers().find((u) => u.email === email);
    const hash = await hashPassword(password);
    if (!user || user.passwordHash !== hash) {
      showLoginMessage('Email or password is wrong. Please try again.', 'bad');
      return;
    }
    if (user.role !== 'admin') {
      if (user.status === 'pending') {
        showLoginMessage('Your request is waiting for admin approval. Please check again later.', '');
        return;
      }
      if (user.status === 'rejected') {
        showLoginMessage('Your request was not approved. Please contact the admin.', 'bad');
        return;
      }
    }
    setSession(user.id);
    form.reset();
    renderNav();
    redirect(user.role === 'admin' ? 'admin' : 'dashboard');
  }

  /* ============ 7. MEMBER DASHBOARD ============ */
  let dashTab = 'card';
  let profilePhoto = '';

  function setTab(name) {
    dashTab = name;
    $$('.tab').forEach((t) => {
      const on = t.dataset.tab === name;
      t.classList.toggle('active', on);
      t.setAttribute('aria-selected', String(on));
    });
    $$('.tab-panel').forEach((p) => {
      const on = p.id === 'tab-' + name;
      p.classList.toggle('active', on);
      p.hidden = !on;
    });
  }

  function renderDashboard() {
    const u = currentUser();
    if (!u) return;
    $('#dashAvatar').innerHTML = avatarHTML(u, 'avatar');
    $('#dashName').textContent = u.name;
    $('#dashEmail').textContent = u.email;
    mountCard($('#dashCard'), u);

    const rows = [
      ['Card number', u.cardNo, 'mono'],
      ['Name', u.name],
      ['Email', u.email],
      ['Mobile', u.phone || '-'],
      ['Profession', u.title || '-'],
      ['City', u.city || '-'],
      ['Member since', formatDate(u.createdAt)]
    ];
    $('#detailList').innerHTML = rows.map((r) =>
      '<div><dt>' + esc(r[0]) + '</dt><dd class="' + (r[2] || '') + '">' + esc(r[1]) + '</dd></div>').join('');

    renderDocs();
    fillProfile(u);
    setTab(dashTab);
  }

  /* --- documents --- */
  function guessType(file) {
    if (['application/pdf', 'image/jpeg', 'image/png'].includes(file.type)) return file.type;
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    if (ext === 'pdf') return 'application/pdf';
    if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
    if (ext === 'png') return 'image/png';
    return '';
  }

  function readAsDataURL(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Could not read ' + file.name));
      reader.onload = () => resolve(reader.result);
      reader.readAsDataURL(file);
    });
  }

  function docHTML(d) {
    const isPdf = d.type === 'application/pdf';
    const label = isPdf ? 'PDF' : (d.type === 'image/png' ? 'PNG' : 'JPG');
    const thumb = isPdf
      ? '<div class="doc-thumb pdf">PDF</div>'
      : '<div class="doc-thumb"><img src="' + esc(d.data) + '" alt=""></div>';
    return '<article class="doc" data-id="' + esc(d.id) + '">' + thumb +
      '<div class="doc-info"><p class="doc-name" title="' + esc(d.name) + '">' + esc(d.name) + '</p>' +
      '<p class="doc-meta">' + label + ' · ' + formatBytes(d.size) + ' · ' + formatDate(d.addedAt) + '</p></div>' +
      '<div class="doc-actions">' +
        '<button class="btn btn-ghost btn-sm" type="button" data-action="download">' + SVG_USE('i-download') + 'Download</button>' +
        '<button class="btn btn-del btn-sm" type="button" data-action="delete">' + SVG_USE('i-trash') + 'Delete</button>' +
      '</div></article>';
  }

  function renderDocs() {
    const u = currentUser();
    if (!u) return;
    const docs = getDocs(u.id);
    $('#docCount').textContent = docs.length;
    $('#docList').innerHTML = docs.length
      ? docs.map(docHTML).join('')
      : '<div class="empty">No documents yet. Upload your first file above.</div>';
  }

  async function handleFiles(fileList) {
    const u = currentUser();
    if (!u) return;
    const docs = getDocs(u.id);
    let added = 0;
    for (const file of Array.from(fileList)) {
      const type = guessType(file);
      if (!type) { toast(file.name + ': only PDF, JPG or PNG files are allowed.'); continue; }
      if (file.size > MAX_FILE_BYTES) { toast(file.name + ' is bigger than 1.5 MB.'); continue; }
      if (docs.length >= MAX_DOCS) { toast('You can keep 10 files. Delete one to add more.'); break; }
      try {
        const raw = await readAsDataURL(file);
        const data = 'data:' + type + ';base64,' + raw.split(',')[1];
        docs.push({ id: uid('d'), name: file.name, type: type, size: file.size, addedAt: new Date().toISOString(), data: data });
        added++;
      } catch (err) {
        toast(err.message);
      }
    }
    if (added) {
      if (saveDocs(u.id, docs)) toast(added + (added > 1 ? ' files uploaded.' : ' file uploaded.'));
      else toast('Browser storage is full. Delete a file and try again.');
      renderDocs();
    }
  }

  function downloadDoc(doc) {
    const parts = doc.data.split(',');
    const bytes = atob(parts[1]);
    const arr = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
    const url = URL.createObjectURL(new Blob([arr], { type: doc.type }));
    const a = document.createElement('a');
    a.href = url;
    a.download = doc.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    toast('Downloading ' + doc.name);
  }

  async function onDocAction(e) {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const u = currentUser();
    const id = btn.closest('.doc').dataset.id;
    const docs = getDocs(u.id);
    const doc = docs.find((d) => d.id === id);
    if (!doc) return;
    if (btn.dataset.action === 'download') {
      downloadDoc(doc);
    } else if (btn.dataset.action === 'delete') {
      const yes = await confirmDialog({ title: 'Delete this file?', text: doc.name + ' will be removed. You cannot undo this.', okLabel: 'Delete file' });
      if (!yes) return;
      saveDocs(u.id, docs.filter((d) => d.id !== id));
      renderDocs();
      toast('File deleted.');
    }
  }

  /* --- profile --- */
  function fillProfile(u) {
    $('#profName').value = u.name;
    $('#profPhone').value = u.phone || '';
    $('#profTitle').value = u.title || '';
    $('#profCity').value = u.city || '';
    profilePhoto = u.photo || '';
    showPhotoPreview('profPhotoPreview', profilePhoto);
  }

  function onProfileSave(e) {
    e.preventDefault();
    const form = e.currentTarget;
    const u = currentUser();
    const name = $('#profName').value.trim();
    const phone = cleanPhone($('#profPhone').value);
    const errors = {};
    if (name.length < 2) errors.profName = 'Enter your full name.';
    if (!PHONE_RE.test(phone)) errors.profPhone = 'Enter a 10 digit mobile number.';
    if (showErrors(form, errors)) return;

    const users = getUsers();
    const me = users.find((x) => x.id === u.id);
    me.name = name;
    me.phone = phone;
    me.title = $('#profTitle').value.trim();
    me.city = $('#profCity').value.trim();
    me.photo = profilePhoto;
    if (!saveUsers(users)) { toast('Browser storage is full. Try a smaller photo.'); return; }
    renderDashboard();
    toast('Profile saved.');
  }

  function saveQrImage() {
    const u = currentUser();
    const img = $('#dashCard .qr-box img');
    if (!img) { toast('QR code is not ready yet.'); return; }
    const a = document.createElement('a');
    a.href = img.src;
    a.download = u.cardNo + '-QR.png';
    document.body.appendChild(a);
    a.click();
    a.remove();
    toast('Downloading QR code.');
  }

  /* ============ 8. ADMIN DASHBOARD ============ */
  let adminFilter = 'all';
  let adminQuery = '';

  function renderAdmin() {
    const members = getUsers().filter((u) => u.role !== 'admin');
    const count = (s) => members.filter((u) => u.status === s).length;

    $('#adminStats').innerHTML = [
      ['All members', members.length, 'all'],
      ['Waiting for approval', count('pending'), 'pending'],
      ['Approved', count('approved'), 'approved'],
      ['Rejected', count('rejected'), 'rejected']
    ].map((s) => '<div class="stat ' + s[2] + '"><div class="stat-label">' + s[0] + '</div><div class="stat-value">' + s[1] + '</div></div>').join('');

    const q = adminQuery.toLowerCase();
    const list = members
      .filter((u) => adminFilter === 'all' || u.status === adminFilter)
      .filter((u) => !q || (u.name + ' ' + u.email + ' ' + u.cardNo).toLowerCase().includes(q))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    $('#adminRows').innerHTML = list.length ? list.map((u) => {
      const approve = u.status !== 'approved'
        ? '<button class="btn btn-ok btn-sm" type="button" data-action="approve">' + SVG_USE('i-check') + 'Approve</button>' : '';
      const reject = u.status !== 'rejected'
        ? '<button class="btn btn-no btn-sm" type="button" data-action="reject">' + SVG_USE('i-x') + 'Reject</button>' : '';
      return '<tr data-id="' + esc(u.id) + '">' +
        '<td><div class="cell-user">' + avatarHTML(u, 'avatar sm') +
          '<div><strong>' + esc(u.name) + (u.sample ? '<span class="sample-chip">Sample</span>' : '') + '</strong><small>' + esc(u.email) + '</small></div></div></td>' +
        '<td class="mono">' + esc(u.cardNo) + '</td>' +
        '<td>' + esc(u.city || '-') + '</td>' +
        '<td>' + getDocs(u.id).length + '</td>' +
        '<td>' + formatDate(u.createdAt) + '</td>' +
        '<td><span class="pill ' + u.status + '">' + u.status.charAt(0).toUpperCase() + u.status.slice(1) + '</span></td>' +
        '<td><div class="row-actions">' + approve + reject +
          '<button class="btn btn-del btn-sm" type="button" data-action="delete" aria-label="Delete ' + esc(u.name) + '">' + SVG_USE('i-trash') + '</button></div></td>' +
        '</tr>';
    }).join('') : '<tr><td class="table-empty" colspan="7">No members match this view.</td></tr>';
  }

  async function onAdminAction(e) {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const id = btn.closest('tr').dataset.id;
    const users = getUsers();
    const user = users.find((u) => u.id === id);
    if (!user) return;
    const action = btn.dataset.action;

    if (action === 'approve' || action === 'reject') {
      user.status = action === 'approve' ? 'approved' : 'rejected';
      saveUsers(users);
      renderAdmin();
      toast(user.name + (action === 'approve' ? ' is approved.' : ' is rejected.'));
    } else if (action === 'delete') {
      const yes = await confirmDialog({ title: 'Delete this member?', text: user.name + ' and all their files will be removed. You cannot undo this.', okLabel: 'Delete member' });
      if (!yes) return;
      saveUsers(users.filter((u) => u.id !== id));
      removeDocs(id);
      renderAdmin();
      toast('Member deleted.');
    }
  }

  async function onReset() {
    const yes = await confirmDialog({ title: 'Reset demo data?', text: 'All members, cards and files will be erased and the sample members come back.', okLabel: 'Reset everything' });
    if (!yes) return;
    store.remove(KEY_USERS);
    store.remove(KEY_DOCS);
    clearSession();
    await seed();
    renderNav();
    redirect('home');
    toast('Demo data is reset.');
  }

  /* ============ 9. START ============ */
  // Pehli baar khulne par admin aur kuch sample members bana deta hai
  async function seed() {
    if (getUsers().length) return;
    const adminHash = await hashPassword(ADMIN_PASSWORD);
    const sampleHash = await hashPassword(SAMPLE_PASSWORD);
    const users = [{
      id: 'u_admin', role: 'admin', status: 'approved', name: 'Site Admin',
      email: ADMIN_EMAIL, phone: '', title: 'Administrator', city: '',
      photo: '', passwordHash: adminHash, cardNo: 'MC-ADMIN', createdAt: daysAgo(30)
    }];
    const samples = [
      ['Priya Verma', 'priya.verma@example.com', '9810000001', 'Teacher', 'Jaipur', 'pending', 1],
      ['Rahul Kumar', 'rahul.kumar@example.com', '9810000002', 'Web Designer', 'Lucknow', 'pending', 2],
      ['Sneha Singh', 'sneha.singh@example.com', '9810000003', 'Photographer', 'Pune', 'approved', 6]
    ];
    samples.forEach((s) => {
      users.push({
        id: uid('u'), role: 'user', status: s[5], sample: true, name: s[0], email: s[1],
        phone: s[2], title: s[3], city: s[4], photo: '', passwordHash: sampleHash,
        cardNo: newCardNo(users), createdAt: daysAgo(s[6])
      });
    });
    saveUsers(users);
  }

  function bindEvents() {
    window.addEventListener('hashchange', route);

    document.addEventListener('click', (e) => {
      const logoutBtn = e.target.closest('[data-action="logout"]');
      if (logoutBtn) logout();
    });

    $('#registerForm').addEventListener('submit', onRegister);
    bindPhotoPicker('regPhoto', 'regPhotoPreview', (url) => { regPhoto = url; });

    $('#loginForm').addEventListener('submit', onLogin);
    $$('[data-fill]').forEach((b) => b.addEventListener('click', () => {
      const admin = b.dataset.fill === 'admin';
      $('#loginEmail').value = admin ? ADMIN_EMAIL : 'sneha.singh@example.com';
      $('#loginPassword').value = admin ? ADMIN_PASSWORD : SAMPLE_PASSWORD;
    }));

    $$('.tab').forEach((t) => t.addEventListener('click', () => setTab(t.dataset.tab)));
    $('#flipBtn').addEventListener('click', () => { const c = $('#dashCard .card3d'); if (c) c.click(); });
    $('#copyNoBtn').addEventListener('click', () => { const u = currentUser(); if (u) copyText(u.cardNo, 'Card number copied.'); });
    $('#saveQrBtn').addEventListener('click', saveQrImage);

    const docInput = $('#docInput');
    docInput.addEventListener('change', async () => { await handleFiles(docInput.files); docInput.value = ''; });
    const zone = $('#dropzone');
    ['dragenter', 'dragover'].forEach((ev) => zone.addEventListener(ev, (e) => { e.preventDefault(); zone.classList.add('drag'); }));
    ['dragleave', 'drop'].forEach((ev) => zone.addEventListener(ev, (e) => { e.preventDefault(); zone.classList.remove('drag'); }));
    zone.addEventListener('drop', (e) => handleFiles(e.dataTransfer.files));
    $('#docList').addEventListener('click', onDocAction);

    $('#profileForm').addEventListener('submit', onProfileSave);
    bindPhotoPicker('profPhoto', 'profPhotoPreview', (url) => { profilePhoto = url; });

    $('#adminRows').addEventListener('click', onAdminAction);
    $('#adminFilter').addEventListener('click', (e) => {
      const b = e.target.closest('[data-filter]');
      if (!b) return;
      adminFilter = b.dataset.filter;
      $$('#adminFilter .seg').forEach((s) => s.classList.toggle('active', s === b));
      renderAdmin();
    });
    $('#adminSearch').addEventListener('input', (e) => { adminQuery = e.target.value.trim(); renderAdmin(); });
    $('#resetBtn').addEventListener('click', onReset);
  }

  async function init() {
    await seed();
    bindEvents();
    mountCard($('#heroCard'), SAMPLE_CARD_USER);
    route();
  }

  init();
})();
