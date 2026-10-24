(() => {
  const WHATSAPP_NUMBER = '5551989891331';
  const INSTAGRAM = 'https://www.instagram.com/barbeariadoedi.nh/';
  const KEYS = { services: 'edy-site-services-v1', hours: 'edy-site-hours-v1', requests: 'edy-site-requests-v1' };
  const defaultServices = [
    { id: 'corte', name: 'Corte de cabelo', description: 'Cabelo alinhado ao teu estilo, com acabamento caprichado.', price: null, duration: 40, active: true },
    { id: 'barba', name: 'Barba', description: 'Cuidado e desenho para deixar a barba na régua.', price: null, duration: 30, active: true },
    { id: 'cabelo-barba', name: 'Cabelo + barba', description: 'Um cuidado completo para renovar o visual.', price: null, duration: 70, active: true }
  ];
  const defaultHours = { days: [1, 2, 3, 4, 5, 6], open: '09:00', close: '19:00', step: 30 };
  const weekdayNames = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const db = window.barberSupabase;
  const read = (key, fallback) => {
    try { const data = localStorage.getItem(key); return data ? JSON.parse(data) : fallback; }
    catch { return fallback; }
  };
  const write = (key, value) => localStorage.setItem(key, JSON.stringify(value));
  let services = read(KEYS.services, defaultServices);
  let hours = read(KEYS.hours, defaultHours);
  let requests = read(KEYS.requests, []);
  let adminAuthorized = false;

  function escapeHTML(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  }
  function money(value) {
    if (value === null || value === '' || value === undefined) return 'Consultar';
    return Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }
  function toDatabaseService(service) { return { id: service.id, name: service.name, description: service.description || '', price: service.price ?? null, duration_minutes: Number(service.duration) || 40, active: service.active !== false }; }
  function fromDatabaseService(service) { return { id: service.id, name: service.name, description: service.description || '', price: service.price, duration: service.duration_minutes, active: service.active }; }
  function fromDatabaseBooking(booking) {
    const date = booking.booking_date;
    const dateLabel = new Date(`${date}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
    return { id: booking.id, serviceId: booking.service_id, serviceName: services.find(service => service.id === booking.service_id)?.name || '', duration: booking.duration_minutes, name: booking.customer_name || '', phone: booking.customer_phone || '', date, dateLabel, time: booking.start_time, startMinute: booking.start_minute, status: booking.status, createdAt: booking.created_at };
  }
  async function loadSharedData(includePrivate = adminAuthorized) {
    if (!db) return;
    const bookingsQuery = includePrivate
      ? db.from('bookings').select('*').order('booking_date').order('start_time')
      : db.from('bookings').select('id,service_id,booking_date,start_time,start_minute,duration_minutes,status').in('status', ['pending', 'confirmed']).order('booking_date').order('start_time');
    const [serviceResult, hoursResult, bookingResult] = await Promise.all([
      db.from('services').select('*').order('name'),
      db.from('business_hours').select('*').eq('id', true).single(),
      bookingsQuery
    ]);
    const problem = serviceResult.error || hoursResult.error || bookingResult.error;
    if (problem) throw problem;
    services = (serviceResult.data || []).map(fromDatabaseService);
    const sharedHours = hoursResult.data;
    hours = { days: sharedHours.days, open: sharedHours.open_time, close: sharedHours.close_time, step: sharedHours.slot_step };
    requests = (bookingResult.data || []).map(fromDatabaseBooking);
    renderServices(); renderBookingServices(); renderAdminServices(); updateAvailableTimes(); renderAdminRequests(); renderPublicCalendar();
  }
  async function persistServices(previousServices = services) {
    renderServices(); renderBookingServices(); renderAdminServices(); renderPublicCalendar();
    const feedback = $('#service-feedback');
    if (!db || !adminAuthorized) {
      write(KEYS.services, services);
      if (feedback) feedback.textContent = 'Serviço salvo neste navegador.';
      return true;
    }
    const { error: saveError } = services.length
      ? await db.from('services').upsert(services.map(toDatabaseService), { onConflict: 'id' })
      : { error: null };
    let problem = saveError;
    if (!problem) {
      const { data: saved, error: readError } = await db.from('services').select('id');
      problem = readError;
      const removed = (saved || []).map(item => item.id).filter(id => !services.some(service => service.id === id));
      if (!problem && removed.length) {
        const { error } = await db.from('services').delete().in('id', removed);
        problem = error;
      }
    }
    if (problem) {
      services = previousServices;
      write(KEYS.services, services);
      await loadSharedData(true).catch(() => {});
      if (feedback) feedback.textContent = `Não foi possível salvar no Supabase: ${problem.message}`;
      return false;
    }
    write(KEYS.services, services);
    await loadSharedData(true).catch(showDatabaseError);
    if (feedback) feedback.textContent = 'Serviço salvo e publicado na página principal.';
    return true;
  }
  function persistRequests() { write(KEYS.requests, requests); updateAvailableTimes(); renderAdminRequests(); renderPublicCalendar(); }
  function showDatabaseError(error) {
    const feedback = $('#form-feedback');
    if (feedback) feedback.textContent = `Não foi possível sincronizar com a agenda online: ${error.message || error}`;
  }
  let calendarMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  let calendarDate = dateISO(new Date());
  function slotData(dateValue) {
    const day = new Date(`${dateValue}T12:00:00`);
    if (!hours.days.includes(day.getDay())) return [];
    const [oh, om] = hours.open.split(':').map(Number); const [ch, cm] = hours.close.split(':').map(Number);
    const start = oh * 60 + om; const close = ch * 60 + cm; const step = Number(hours.step) || 30;
    const service = getSelectedService(); const duration = Number(service?.duration) || step;
    const dayRequests = requests.filter(request => request.date === dateValue && request.status !== 'cancelled');
    const now = new Date(); const today = dateISO(now);
    const slots = [];
    for (let time = start; time + duration <= close; time += step) {
      if (dateValue === today && time <= now.getHours() * 60 + now.getMinutes()) continue;
      const value = `${String(Math.floor(time / 60)).padStart(2, '0')}:${String(time % 60).padStart(2, '0')}`;
      const overlap = dayRequests.find(request => {
        const [h, m] = request.time.split(':').map(Number); const bookedStart = h * 60 + m;
        const bookedService = services.find(item => item.id === request.serviceId);
        return time < bookedStart + Number(bookedService?.duration || request.duration || 40) && time + duration > bookedStart;
      });
      slots.push({ time: value, status: overlap?.status === 'confirmed' ? 'booked' : overlap ? 'pending' : 'free', request: overlap });
    }
    return slots;
  }
  function renderPublicCalendar() {
    const daysRoot = $('#calendar-days'); if (!daysRoot) return;
    const monthTitle = $('#calendar-month');
    monthTitle.textContent = calendarMonth.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    const year = calendarMonth.getFullYear(); const month = calendarMonth.getMonth();
    const firstWeekday = new Date(year, month, 1).getDay(); const daysInMonth = new Date(year, month + 1, 0).getDate();
    const today = dateISO(new Date()); const maxDate = new Date(); maxDate.setDate(maxDate.getDate() + 90); const max = dateISO(maxDate);
    let cells = Array(firstWeekday).fill('<span class="calendar-blank" aria-hidden="true"></span>');
    for (let day = 1; day <= daysInMonth; day++) {
      const dateValue = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const weekday = new Date(`${dateValue}T12:00:00`).getDay(); const enabled = dateValue >= today && dateValue <= max && hours.days.includes(weekday);
      const slots = enabled ? slotData(dateValue) : []; const available = slots.filter(slot => slot.status === 'free').length;
      const reserved = slots.some(slot => slot.status === 'booked'); const className = `${enabled ? 'calendar-day' : 'calendar-day disabled'}${dateValue === calendarDate ? ' selected' : ''}${enabled && available === 0 ? ' full' : ''}`;
      cells.push(`<button type="button" class="${className}" data-calendar-date="${dateValue}" ${enabled ? '' : 'disabled'} aria-label="${day} ${monthTitle.textContent}${reserved ? ', possui reserva' : ''}${available ? `, ${available} horários disponíveis` : ''}"><span>${day}</span>${enabled ? `<i class="${reserved ? 'has-booking' : 'has-free'}"></i>` : ''}</button>`);
    }
    daysRoot.innerHTML = cells.join('');
    $$('[data-calendar-date]', daysRoot).forEach(button => button.addEventListener('click', () => {
      calendarDate = button.dataset.calendarDate; $('#booking-date').value = calendarDate; updateAvailableTimes(); renderPublicCalendar();
    }));
    const chosen = new Date(`${calendarDate}T12:00:00`);
    $('#calendar-selected-label').textContent = `Horários — ${chosen.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}`;
    const slots = slotData(calendarDate); const list = $('#calendar-slot-list');
    if (!hours.days.includes(chosen.getDay())) { list.innerHTML = '<p class="calendar-empty">A barbearia não atende neste dia.</p>'; return; }
    if (!slots.length) { list.innerHTML = '<p class="calendar-empty">Não há horários disponíveis para este dia.</p>'; return; }
    list.innerHTML = slots.map(slot => `<button type="button" class="calendar-slot ${slot.status}" data-calendar-time="${slot.time}" ${slot.status === 'free' ? '' : 'disabled'}><b>${slot.time}</b><span>${slot.status === 'booked' ? 'Reservado' : slot.status === 'pending' ? 'Aguardando confirmação' : 'Disponível'}</span></button>`).join('');
    $$('[data-calendar-time]', list).forEach(button => button.addEventListener('click', () => {
      const service = getSelectedService();
      if (!service) { $('#booking-service').focus(); $('#form-feedback').textContent = 'Selecione um serviço para continuar.'; return; }
      $('#booking-time').value = button.dataset.calendarTime; $('#booking-time').dispatchEvent(new Event('change')); $('#booking-name').focus();
    }));
  }
  function renderServices() {
    const grid = $('#services-grid');
    const active = services.filter(service => service.active !== false);
    if (!active.length) {
      grid.innerHTML = '<p class="admin-empty">Novos serviços em breve. Chame a barbearia pelo WhatsApp.</p>';
      return;
    }
    grid.innerHTML = active.map((service, index) => `
      <article class="service-card">
        <div class="service-topline"><span>0${index + 1} / SERVIÇO</span><span class="service-icon" aria-hidden="true">✂</span></div>
        <h3>${escapeHTML(service.name)}</h3><p>${escapeHTML(service.description || 'Um cuidado pensado para você sair com o visual em dia.')}</p>
        <div class="service-bottom"><div class="service-price"><small>A PARTIR DE</small>${escapeHTML(money(service.price))}<span class="service-duration"> · ${escapeHTML(service.duration)} min</span></div><a class="service-book" href="https://api.whatsapp.com/send/?phone=${WHATSAPP_NUMBER}&text=${encodeURIComponent(`Olá, Édi! Quero saber sobre ${service.name} e agendar um horário.`)}&type=phone_number&app_absent=0" target="_blank" rel="noreferrer" aria-label="Falar no WhatsApp sobre ${escapeHTML(service.name)}">↗</a></div>
      </article>`).join('');
  }
  function renderBookingServices() {
    const select = $('#booking-service');
    const previous = select.value;
    const active = services.filter(service => service.active !== false);
    select.innerHTML = '<option value="">Selecione um serviço</option>' + active.map(service => `<option value="${escapeHTML(service.id)}">${escapeHTML(service.name)} · ${escapeHTML(money(service.price))} · ${escapeHTML(service.duration)} min</option>`).join('');
    if (active.some(service => service.id === previous)) select.value = previous;
  }
  function renderAdminServices() {
    const list = $('#admin-service-list');
    if (!services.length) { list.innerHTML = '<div class="admin-empty">Nenhum serviço cadastrado.</div>'; return; }
    list.innerHTML = services.map(service => `<div class="admin-row"><div><strong>${escapeHTML(service.name)}</strong><small>${escapeHTML(money(service.price))} · ${escapeHTML(service.duration)} minutos · ${service.active === false ? 'Oculto no site' : 'Visível no site'}</small></div><div class="row-actions"><button type="button" data-edit="${escapeHTML(service.id)}">Editar</button><button type="button" data-toggle="${escapeHTML(service.id)}">${service.active === false ? 'Publicar' : 'Ocultar'}</button><button class="delete-action" type="button" data-delete="${escapeHTML(service.id)}">Excluir</button></div></div>`).join('');
    $$('[data-edit]', list).forEach(button => button.addEventListener('click', () => editService(button.dataset.edit)));
    $$('[data-toggle]', list).forEach(button => button.addEventListener('click', async () => {
      const previousServices = services;
      services = services.map(service => service.id === button.dataset.toggle ? { ...service, active: service.active === false } : service);
      await persistServices(previousServices);
    }));
    $$('[data-delete]', list).forEach(button => button.addEventListener('click', async () => {
      const previousServices = services;
      services = services.filter(service => service.id !== button.dataset.delete);
      if (await persistServices(previousServices)) resetServiceForm();
    }));
  }
  function renderAdminRequests() {
    const list = $('#admin-request-list');
    if (!requests.length) { list.innerHTML = '<div class="admin-empty">Nenhum pedido online.</div>'; return; }
    list.innerHTML = [...requests].reverse().map(request => {
      const service = services.find(item => item.id === request.serviceId);
      const status = request.status === 'confirmed' ? 'Confirmado' : request.status === 'cancelled' ? 'Cancelado' : 'Aguardando WhatsApp';
      return `<div class="admin-row"><div><strong>${escapeHTML(request.name)} · ${escapeHTML(service?.name || request.serviceName)}</strong><small>${escapeHTML(request.dateLabel)} às ${escapeHTML(request.time)} · ${escapeHTML(request.phone)}</small></div><div class="row-actions"><span class="request-status">${status}</span>${request.status !== 'confirmed' ? `<button type="button" data-confirm="${escapeHTML(request.id)}">Confirmar</button>` : ''}${request.status !== 'cancelled' ? `<button class="delete-action" type="button" data-cancel="${escapeHTML(request.id)}">Cancelar</button>` : ''}</div></div>`;
    }).join('');
    $$('[data-confirm]', list).forEach(button => button.addEventListener('click', async () => {
      button.disabled = true;
      if (db && adminAuthorized) {
        const { error } = await db.from('bookings').update({ status: 'confirmed' }).eq('id', button.dataset.confirm);
        if (error) { button.disabled = false; $('#admin-login-feedback').textContent = `Não foi possível confirmar: ${error.message}`; return; }
        await loadSharedData(true).catch(showDatabaseError); return;
      }
      requests = requests.map(request => request.id === button.dataset.confirm ? { ...request, status: 'confirmed' } : request);
      persistRequests();
    }));
    $$('[data-cancel]', list).forEach(button => button.addEventListener('click', async () => {
      button.disabled = true;
      if (db && adminAuthorized) {
        const { error } = await db.from('bookings').update({ status: 'cancelled' }).eq('id', button.dataset.cancel);
        if (error) { button.disabled = false; $('#admin-login-feedback').textContent = `Não foi possível cancelar: ${error.message}`; return; }
        await loadSharedData(true).catch(showDatabaseError); return;
      }
      requests = requests.map(request => request.id === button.dataset.cancel ? { ...request, status: 'cancelled' } : request);
      persistRequests();
    }));
  }
  function editService(id) {
    const service = services.find(item => item.id === id);
    if (!service) return;
    $('#service-id').value = service.id;
    $('#service-name').value = service.name;
    $('#service-description').value = service.description || '';
    $('#service-price').value = service.price ?? '';
    $('#service-duration').value = service.duration;
    $('#service-editor-title').textContent = 'Editar serviço';
    $('#service-list-view').hidden = true;
    $('#service-editor').hidden = false;
    $('#service-feedback').textContent = '';
    $('#service-name').focus();
  }
  function newService() {
    resetServiceForm();
    $('#service-editor-title').textContent = 'Cadastrar serviço';
    $('#service-list-view').hidden = true;
    $('#service-editor').hidden = false;
    $('#service-name').focus();
  }
  function resetServiceForm() {
    $('#service-form').reset();
    $('#service-id').value = '';
    $('#service-description').value = '';
    $('#service-duration').value = 40;
    $('#service-editor-title').textContent = 'Cadastrar serviço';
    $('#service-list-view').hidden = false;
    $('#service-editor').hidden = true;
    $('#service-feedback').textContent = '';
  }
  function getSelectedService() { return services.find(service => service.id === $('#booking-service').value && service.active !== false); }
  function dateISO(date) {
    const year = date.getFullYear(); const month = String(date.getMonth() + 1).padStart(2, '0'); const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  function updateAvailableTimes() {
    const dateInput = $('#booking-date');
    const select = $('#booking-time');
    const dateValue = dateInput.value;
    const service = getSelectedService();
    select.innerHTML = '';
    if (!dateValue || !service) {
      select.disabled = true;
      select.innerHTML = '<option value="">Escolha serviço e data</option>';
      return;
    }
    const date = new Date(`${dateValue}T12:00:00`);
    if (!hours.days.includes(date.getDay())) {
      select.disabled = true;
      select.innerHTML = '<option value="">A barbearia não atende neste dia</option>';
      return;
    }
    const [openHour, openMinute] = hours.open.split(':').map(Number);
    const [closeHour, closeMinute] = hours.close.split(':').map(Number);
    const start = openHour * 60 + openMinute;
    const close = closeHour * 60 + closeMinute;
    const duration = Number(service.duration) || 40;
    const booked = requests.filter(request => request.date === dateValue && request.status !== 'cancelled').map(request => {
      const [bookedHour, bookedMinute] = request.time.split(':').map(Number);
      const bookedService = services.find(item => item.id === request.serviceId);
      return { start: bookedHour * 60 + bookedMinute, end: bookedHour * 60 + bookedMinute + Number(bookedService?.duration || request.duration || 40) };
    });
    const now = new Date();
    const today = dateISO(now);
    const options = [];
    for (let time = start; time + duration <= close; time += Number(hours.step) || 30) {
      const value = `${String(Math.floor(time / 60)).padStart(2, '0')}:${String(time % 60).padStart(2, '0')}`;
      const overlaps = booked.some(booking => time < booking.end && time + duration > booking.start);
      if (!overlaps && (dateValue !== today || time > now.getHours() * 60 + now.getMinutes())) options.push(`<option value="${value}">${value}</option>`);
    }
    if (!options.length) {
      select.disabled = true;
      select.innerHTML = '<option value="">Não há horários livres nesse dia</option>';
      return;
    }
    select.disabled = false;
    select.innerHTML = '<option value="">Selecione um horário</option>' + options.join('');
  }
  function renderWeekdayPicks() {
    $('#weekday-picks').innerHTML = weekdayNames.map((name, index) => `<label><input type="checkbox" value="${index}" ${hours.days.includes(index) ? 'checked' : ''}><span>${name}</span></label>`).join('');
  }
  async function showAdminPanel(session) {
    const login = $('#admin-login'); const content = $('#admin-content');
    if (!db || !session?.user) { login.hidden = false; content.hidden = true; $('#admin-login-feedback').textContent = 'Entre com a conta autorizada da barbearia.'; return; }
    const { data, error } = await db.from('barber_admins').select('user_id').eq('user_id', session.user.id).maybeSingle();
    if (error || !data) {
      adminAuthorized = false; await db.auth.signOut();
      login.hidden = false; content.hidden = true;
      $('#admin-login-feedback').textContent = 'Esta conta ainda não tem acesso à área da barbearia.';
      return;
    }
    adminAuthorized = true; login.hidden = true; content.hidden = false;
    $('#hours-open').value = hours.open;
    $('#hours-close').value = hours.close;
    $('#hours-step').value = String(hours.step);
    renderWeekdayPicks();
    renderAdminServices();
    await loadSharedData(true).catch(showDatabaseError);
  }
  async function openAdmin() {
    $('#admin-login').hidden = false; $('#admin-content').hidden = true; $('#admin-login-feedback').textContent = '';
    $('#admin-dialog').showModal();
    if (db) {
      const { data } = await db.auth.getSession();
      if (data.session) await showAdminPanel(data.session);
    } else $('#admin-login-feedback').textContent = 'Não foi possível carregar a conexão com o Supabase.';
  }
  function setupAdmin() {
    const dialog = $('#admin-dialog');
    $('#admin-open').addEventListener('click', openAdmin);
    $('#admin-login-form').addEventListener('submit', async event => {
      event.preventDefault();
      if (!db) { $('#admin-login-feedback').textContent = 'Conexão com o Supabase indisponível.'; return; }
      $('#admin-login-feedback').textContent = 'Verificando acesso…';
      const { data, error } = await db.auth.signInWithPassword({ email: $('#admin-email').value.trim(), password: $('#admin-password').value });
      if (error) { $('#admin-login-feedback').textContent = `Não foi possível entrar: ${error.message}`; return; }
      await showAdminPanel(data.session);
    });
    $('#admin-logout').addEventListener('click', async () => { adminAuthorized = false; await db.auth.signOut(); $('#admin-content').hidden = true; $('#admin-login').hidden = false; $('#admin-password').value = ''; $('#admin-login-feedback').textContent = 'Você saiu da área da barbearia.'; });
    $('.dialog-close', dialog).addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
    $$('.admin-tab').forEach(tab => tab.addEventListener('click', () => {
      $$('.admin-tab').forEach(item => item.classList.toggle('active', item === tab));
      $$('.admin-panel').forEach(panel => { panel.hidden = panel.id !== `panel-${tab.dataset.tab}`; });
    }));
    $('#service-new').addEventListener('click', newService);
    $('#service-form').addEventListener('submit', async event => {
      event.preventDefault();
      const previousServices = services;
      const id = $('#service-id').value || `svc-${Date.now()}`;
      const current = services.find(service => service.id === id);
      const priceValue = $('#service-price').value;
      const service = { id, name: $('#service-name').value.trim(), description: $('#service-description').value.trim(), price: priceValue === '' ? null : Number(priceValue), duration: Number($('#service-duration').value), active: current?.active !== false };
      if (current) services = services.map(item => item.id === id ? service : item); else services = [...services, service];
      if (await persistServices(previousServices)) resetServiceForm();
    });
    $('#service-cancel').addEventListener('click', resetServiceForm);
    $('#hours-form').addEventListener('submit', async event => {
      event.preventDefault();
      const days = $$('input[type="checkbox"]:checked', $('#weekday-picks')).map(input => Number(input.value));
      if (!days.length) { $('#booking-hint').textContent = 'Selecione ao menos um dia de atendimento no painel.'; return; }
      if ($('#hours-close').value <= $('#hours-open').value) { $('#booking-hint').textContent = 'O fechamento precisa ser depois da abertura.'; return; }
      hours = { days, open: $('#hours-open').value, close: $('#hours-close').value, step: Number($('#hours-step').value) };
      write(KEYS.hours, hours);
      if (db && adminAuthorized) {
        const { error } = await db.from('business_hours').update({ days, open_time: hours.open, close_time: hours.close, slot_step: hours.step, updated_at: new Date().toISOString() }).eq('id', true);
        if (error) { $('#booking-hint').textContent = `Não foi possível salvar o expediente: ${error.message}`; return; }
        $('#booking-hint').textContent = 'Expediente salvo e compartilhado com a agenda online.';
      }
      updateAvailableTimes();
      renderPublicCalendar();
    });
  }
  function setupBooking() {
    const date = $('#booking-date');
    date.min = dateISO(new Date());
    const max = new Date(); max.setDate(max.getDate() + 90); date.max = dateISO(max);
    $('#booking-service').addEventListener('change', () => { if (date.value) calendarDate = date.value; updateAvailableTimes(); renderPublicCalendar(); });
    date.addEventListener('change', () => { if (date.value) { calendarDate = date.value; calendarMonth = new Date(`${date.value}T12:00:00`); calendarMonth.setDate(1); } updateAvailableTimes(); renderPublicCalendar(); });
    $('#calendar-prev').addEventListener('click', () => { calendarMonth.setMonth(calendarMonth.getMonth() - 1); renderPublicCalendar(); });
    $('#calendar-next').addEventListener('click', () => { calendarMonth.setMonth(calendarMonth.getMonth() + 1); renderPublicCalendar(); });
    $('#booking-form').addEventListener('submit', async event => {
      event.preventDefault();
      const service = getSelectedService();
      const dateValue = date.value;
      const time = $('#booking-time').value;
      const name = $('#booking-name').value.trim();
      const phone = $('#booking-phone').value.trim();
      const digits = phone.replace(/\D/g, '');
      if (!service || !dateValue || !time || !name || digits.length < 10) {
        $('#form-feedback').textContent = 'Confira os campos e informe um WhatsApp válido.';
        return;
      }
      if (requests.some(request => request.date === dateValue && request.time === time && request.status !== 'cancelled')) {
        $('#form-feedback').textContent = 'Esse horário acabou de ser solicitado. Escolha outro.';
        updateAvailableTimes();
        return;
      }
      const dateObject = new Date(`${dateValue}T12:00:00`);
      const dateLabel = dateObject.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
      const duration = Number(service.duration) || 40;
      if (db) {
        const [hour, minute] = time.split(':').map(Number);
        const { error } = await db.from('bookings').insert({ service_id: service.id, customer_name: name, customer_phone: phone, booking_date: dateValue, start_time: time, start_minute: hour * 60 + minute, duration_minutes: duration });
        if (error) {
          $('#form-feedback').textContent = error.code === '23P01' ? 'Esse horário acabou de ser reservado. Escolha outro horário disponível.' : `Não foi possível registrar o pedido: ${error.message}`;
          await loadSharedData(false).catch(showDatabaseError);
          return;
        }
        await loadSharedData(false).catch(showDatabaseError);
      } else {
        const request = { id: `req-${Date.now()}`, serviceId: service.id, serviceName: service.name, duration, name, phone, date: dateValue, dateLabel, time, status: 'pending', createdAt: new Date().toISOString() };
        requests.push(request); write(KEYS.requests, requests);
      }
      updateAvailableTimes();
      renderPublicCalendar();
      const message = `Olá, Édi! Sou ${name}. Gostaria de solicitar um horário para ${service.name} no dia ${dateLabel}, às ${time}. Meu WhatsApp: ${phone}. Pode confirmar para mim?`;
      const link = `https://api.whatsapp.com/send/?phone=${WHATSAPP_NUMBER}&text=${encodeURIComponent(message)}&type=phone_number&app_absent=0`;
      window.open(link, '_blank', 'noopener,noreferrer');
      $('#form-feedback').textContent = db ? 'Pedido registrado na agenda. Envie a mensagem pelo WhatsApp e aguarde a confirmação do Édi.' : 'Pedido registrado neste navegador. Envie a mensagem no WhatsApp e aguarde a confirmação do Édi.';
      $('#booking-form').reset();
      date.min = dateISO(new Date());
      updateAvailableTimes();
    });
  }
  function setupMenu() {
    const toggle = $('.menu-toggle'); const nav = $('#main-nav');
    toggle.addEventListener('click', () => {
      const open = toggle.getAttribute('aria-expanded') !== 'true';
      toggle.setAttribute('aria-expanded', String(open)); nav.classList.toggle('open', open);
    });
    $$('a', nav).forEach(link => link.addEventListener('click', () => { nav.classList.remove('open'); toggle.setAttribute('aria-expanded', 'false'); }));
  }
  function init() {
    $('#year').textContent = new Date().getFullYear();
    renderServices(); renderBookingServices(); setupBooking(); setupAdmin(); setupMenu(); renderPublicCalendar();
    if (db) {
      loadSharedData(false).catch(showDatabaseError);
      db.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_OUT') adminAuthorized = false;
      });
      db.channel('barbershop-live-calendar')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, () => loadSharedData(adminAuthorized).catch(showDatabaseError))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'services' }, () => loadSharedData(adminAuthorized).catch(showDatabaseError))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'business_hours' }, () => loadSharedData(adminAuthorized).catch(showDatabaseError))
        .subscribe();
    }
  }
  init();
})();
