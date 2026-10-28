(() => {
  const $ = id => document.getElementById(id);
  const cfg = window.BITACORA_CONFIG || {};
  const notice = t => { $("notice").textContent = t || ""; $("notice").hidden = !t; };

  if (!cfg.SUPABASE_URL || cfg.SUPABASE_URL.includes("TU-PROYECTO")) {
    notice("Falta configurar Supabase en config.js (URL y publishable key).");
    return;
  }
  const sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);

  const ROLES = { admin: "Administrador", supervisor: "Supervisor", operador: "Operador", pendiente: "Pendiente", rechazado: "Sin acceso" };
  const ACTIVOS = ["operador", "supervisor", "admin"];

  let session = null, perfil = null, entries = [], usuarios = [], channel = null;

  const pad = n => String(n).padStart(2, "0");
  const nowLocal = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  const fmt = iso => {
    const d = new Date(iso); if (!iso || isNaN(d)) return { day: "—", time: "" };
    return { day: d.toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" }),
             time: d.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit", hour12: false }) };
  };
  const errText = e => {
    const m = (e && e.message) || "Error desconocido";
    if (/rate limit|security purposes/i.test(m)) return "Espera un minuto antes de pedir otro código.";
    if (/expired|invalid/i.test(m) && /token|otp/i.test(m)) return "El código no es válido o ya venció. Pide uno nuevo.";
    if (/signups not allowed/i.test(m)) return "El registro de usuarios está desactivado en Supabase.";
    return m;
  };
  const isActivo = () => perfil && ACTIVOS.includes(perfil.rol);
  const puedeFirmar = () => perfil && (perfil.rol === "supervisor" || perfil.rol === "admin");
  const esAdmin = () => perfil && perfil.rol === "admin";

  // ---------------- Vistas ----------------
  function showAuth(visible) { $("authEmail").hidden = !visible; }

  function renderShell() {
    const logged = !!session;
    $("session").hidden = !logged;
    $("sessionEmail").textContent = session?.user?.email || "";
    if (!logged) {
      ["perfilCard", "pendiente", "rechazado", "work", "counterBox"].forEach(id => $(id).hidden = true);
      showAuth(true);
      return;
    }
    showAuth(false);
    if (!perfil) return;
    const rol = perfil.rol;
    $("perfilCard").hidden = rol === "rechazado";
    $("pendiente").hidden = rol !== "pendiente";
    $("rechazado").hidden = rol !== "rechazado";
    $("work").hidden = !isActivo();
    $("counterBox").hidden = !isActivo();
    $("usuarios").hidden = !esAdmin();
    $("entryForm").hidden = !isActivo();
    $("entryMsg").textContent = puedeFirmar()
      ? "El asiento queda a tu nombre. Un supervisor puede firmar su revisión."
      : "El asiento queda a tu nombre y pendiente de firma del supervisor.";
    renderPerfil();
  }

  function renderPerfil() {
    $("perfilRol").textContent = ROLES[perfil.rol] || perfil.rol;
    const n = $("perfilNombre"), e = $("perfilEmpresa");
    n.textContent = perfil.nombre || "Sin definir"; n.classList.toggle("pending", !perfil.nombre);
    e.textContent = perfil.empresa || "Sin definir"; e.classList.toggle("pending", !perfil.empresa);
  }

  function renderUsuarios() {
    if (!esAdmin()) return;
    const orden = { pendiente: 0, operador: 1, supervisor: 2, admin: 3, rechazado: 4 };
    const list = [...usuarios].sort((a, b) => (orden[a.rol] - orden[b.rol]) || a.email.localeCompare(b.email));
    const pend = usuarios.filter(u => u.rol === "pendiente").length;
    $("pendCount").textContent = pend ? `${pend} por aprobar` : ""; $("pendCount").hidden = !pend;
    const box = $("usersList"); box.replaceChildren();
    for (const u of list) {
      const row = document.createElement("div"); row.className = "user" + (u.rol === "pendiente" ? " is-pend" : "");
      const who = document.createElement("div"); who.className = "who";
      const b = document.createElement("b"); b.textContent = u.nombre || "(sin nombre)";
      const s = document.createElement("span"); s.textContent = `${u.email}${u.empresa ? " · " + u.empresa : ""}`;
      who.append(b, s); row.append(who);
      if (u.id === session.user.id) {
        const me = document.createElement("span"); me.className = "role"; me.textContent = "Administrador (tú)";
        row.append(me);
      } else {
        const sel = document.createElement("select"); sel.setAttribute("aria-label", "Rol de " + u.email);
        for (const r of ["pendiente", "operador", "supervisor", "admin", "rechazado"]) {
          const o = document.createElement("option"); o.value = r; o.textContent = ROLES[r]; if (r === u.rol) o.selected = true; sel.append(o);
        }
        sel.addEventListener("change", async () => {
          sel.disabled = true;
          const { error } = await sb.rpc("asignar_rol", { usuario: u.id, nuevo_rol: sel.value });
          sel.disabled = false;
          if (error) { notice("No se pudo cambiar el rol: " + errText(error)); sel.value = u.rol; }
          else { notice(""); loadUsuarios(); }
        });
        row.append(sel);
      }
      box.append(row);
    }
  }

  function renderEntries() {
    if (!isActivo()) return;
    const q = $("search").value.trim().toLowerCase();
    const f = $("filtro").value;
    const numbered = entries.map((e, i) => ({ ...e, folio: i + 1 }));
    const list = numbered.filter(e =>
      (!q || (e.descripcion || "").toLowerCase().includes(q) || (e.coordinacion_aap || "").toLowerCase().includes(q)) &&
      (f === "todos" || (f === "pendientes" ? !e.revisado_por : !!e.revisado_por))
    ).reverse();
    $("count").textContent = entries.length;
    const box = $("folios"); box.replaceChildren();
    if (!list.length) {
      const d = document.createElement("div"); d.className = "empty";
      d.innerHTML = (q || f !== "todos")
        ? "<strong>Sin resultados</strong>Ningún asiento coincide con el filtro."
        : "<strong>Sin asientos todavía</strong>Registra el primer trabajo supervisado con el formulario de arriba.";
      box.append(d); return;
    }
    for (const e of list) {
      const fe = fmt(e.fecha), signed = !!e.revisado_por;
      const art = document.createElement("article"); art.className = "folio " + (signed ? "signed" : "unsigned");
      art.innerHTML = `<div class="folio-n"><span class="label">Folio</span><span class="n"></span><span class="d" style="white-space:pre-line"></span></div>
        <div class="folio-b"><div><div class="label">Descripción</div><p class="desc"></p></div>
        <div class="aap"><div class="label">Coordinación AAP</div><p class="aapt"></p></div>
        <div class="folio-f"><div class="firmas"><span class="autor"></span><span class="rev"></span></div><div class="actions"></div></div></div>`;
      art.querySelector(".n").textContent = String(e.folio).padStart(3, "0");
      art.querySelector(".d").textContent = `${fe.day}\n${fe.time}`;
      art.querySelector(".desc").textContent = e.descripcion || "";
      art.querySelector(".aapt").textContent = e.coordinacion_aap || "Sin coordinación registrada";
      const autorNombre = e.autor_nombre || e.supervisor_nombre || "—";
      const autorEmpresa = e.autor_empresa || e.supervisor_empresa || "—";
      art.querySelector(".autor").textContent = `Registró: ${autorNombre} · ${autorEmpresa}${e.autor_rol ? " (" + (ROLES[e.autor_rol] || e.autor_rol) + ")" : ""}`;
      const rev = art.querySelector(".rev");
      if (signed) {
        const fr = fmt(e.revisado_en);
        rev.innerHTML = '<span class="status ok">✓ Firmado</span> ';
        rev.append(`${e.revisado_nombre} · ${e.revisado_empresa} · ${fr.day} ${fr.time}`);
      } else {
        rev.innerHTML = '<span class="status pend">Pendiente de firma</span>';
      }
      const actions = art.querySelector(".actions");
      if (!signed && puedeFirmar()) {
        const sign = document.createElement("button"); sign.type = "button"; sign.className = "sign"; sign.textContent = "Firmar revisión";
        sign.addEventListener("click", async () => {
          if (!perfil.nombre || !perfil.empresa) { notice("Completa tu nombre y empresa antes de firmar."); return; }
          sign.disabled = true;
          const { error } = await sb.rpc("firmar_registro", { registro: e.id });
          if (error) { sign.disabled = false; notice("No se pudo firmar: " + errText(error)); } else { notice(""); loadRegistros(); }
        });
        actions.append(sign);
      }
      if (esAdmin()) {
        const del = document.createElement("button"); del.type = "button"; del.className = "danger"; del.textContent = "Eliminar";
        let armed = null;
        del.addEventListener("click", async () => {
          if (!armed) {
            del.textContent = "¿Confirmar eliminación?"; del.classList.add("confirm");
            armed = setTimeout(() => { armed = null; del.textContent = "Eliminar"; del.classList.remove("confirm"); }, 4000);
            return;
          }
          clearTimeout(armed); del.disabled = true;
          const { error } = await sb.from("registros").delete().eq("id", e.id);
          if (error) { del.disabled = false; notice("No se pudo eliminar: " + errText(error)); } else loadRegistros();
        });
        actions.append(del);
      }
      box.append(art);
    }
  }

  // ---------------- Datos ----------------
  async function loadPerfil() {
    const { data, error } = await sb.from("perfiles").select("*").eq("id", session.user.id).maybeSingle();
    if (error) { notice("No se pudo leer tu perfil: " + errText(error)); return; }
    if (!data) { notice("Tu perfil todavía no existe. Recarga la página en unos segundos."); return; }
    const antes = perfil?.rol;
    perfil = data;
    renderShell();
    if (antes !== perfil.rol) {
      if (isActivo()) { loadRegistros(); if (esAdmin()) loadUsuarios(); }
      else { entries = []; }
    }
  }
  async function loadRegistros() {
    if (!isActivo()) return;
    const { data, error } = await sb.from("registros").select("*").order("fecha", { ascending: true }).limit(5000);
    if (error) { notice("No se pudieron leer los asientos: " + errText(error)); return; }
    entries = data || []; renderEntries();
  }
  async function loadUsuarios() {
    if (!esAdmin()) return;
    const { data, error } = await sb.from("perfiles").select("*").order("creado_en", { ascending: true });
    if (error) { notice("No se pudo leer la lista de usuarios: " + errText(error)); return; }
    usuarios = data || []; renderUsuarios();
  }
  function subscribe() {
    if (channel) return;
    channel = sb.channel("bitacora")
      .on("postgres_changes", { event: "*", schema: "public", table: "registros" }, () => loadRegistros())
      .on("postgres_changes", { event: "*", schema: "public", table: "perfiles" }, payload => {
        const id = payload.new?.id || payload.old?.id;
        if (id === session?.user?.id) loadPerfil();
        if (esAdmin()) loadUsuarios();
      })
      .subscribe();
  }
  // Respaldo por si la conexión en vivo se corta: refrescar al volver a la app
  document.addEventListener("visibilitychange", () => { if (!document.hidden && session) { loadPerfil(); loadRegistros(); loadUsuarios(); } });

  // ---------------- Eventos ----------------
  $("search").addEventListener("input", renderEntries);
  $("filtro").addEventListener("change", renderEntries);

  $("perfilEditBtn").addEventListener("click", () => {
    $("perfilNombreIn").value = perfil.nombre; $("perfilEmpresaIn").value = perfil.empresa;
    $("perfilView").hidden = true; $("perfilEditBtn").hidden = true; $("perfilForm").hidden = false; $("perfilNombreIn").focus();
  });
  const closePerfil = () => { $("perfilView").hidden = false; $("perfilEditBtn").hidden = false; $("perfilForm").hidden = true; };
  $("perfilCancel").addEventListener("click", closePerfil);
  $("perfilForm").addEventListener("submit", async ev => {
    ev.preventDefault();
    const cambios = { nombre: $("perfilNombreIn").value.trim(), empresa: $("perfilEmpresaIn").value.trim() };
    const { error } = await sb.from("perfiles").update(cambios).eq("id", session.user.id);
    if (error) { notice("No se pudieron guardar tus datos: " + errText(error)); return; }
    perfil = { ...perfil, ...cambios }; renderPerfil(); closePerfil(); notice("");
  });

  $("entryForm").addEventListener("submit", async ev => {
    ev.preventDefault();
    const msg = $("entryMsg");
    if (!perfil.nombre || !perfil.empresa) { msg.textContent = "Primero completa tu nombre y empresa arriba."; msg.className = "msg err"; return; }
    const fecha = new Date($("fecha").value);
    const row = {
      fecha: isNaN(fecha) ? new Date().toISOString() : fecha.toISOString(),
      descripcion: $("descripcion").value.trim(),
      coordinacion_aap: $("aap").value.trim()
    };
    if (!row.descripcion) return;
    $("saveBtn").disabled = true;
    const { error } = await sb.from("registros").insert(row);
    $("saveBtn").disabled = false;
    if (error) { msg.textContent = "No se pudo registrar el asiento: " + errText(error); msg.className = "msg err"; return; }
    $("descripcion").value = ""; $("aap").value = ""; $("fecha").value = nowLocal();
    msg.textContent = "Asiento registrado."; msg.className = "msg ok";
    loadRegistros();
  });

  // ---------------- Ingreso con enlace por correo ----------------
  $("authEmail").addEventListener("submit", async ev => {
    ev.preventDefault();
    const email = $("email").value.trim().toLowerCase();
    const msg = $("emailMsg");
    $("emailBtn").disabled = true; msg.textContent = "Enviando…"; msg.className = "msg";
    const { error } = await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: true, emailRedirectTo: location.origin + location.pathname } });
    $("emailBtn").disabled = false;
    if (error && /security purposes|rate limit/i.test(error.message)) {
      msg.textContent = "Ya te enviamos un enlace hace un momento. Revisa tu correo (también spam y promociones)."; msg.className = "msg ok"; return;
    }
    if (error) { msg.textContent = "No se pudo enviar el enlace: " + errText(error); msg.className = "msg err"; return; }
    msg.textContent = "Listo. Revisa tu correo y abre el enlace en este mismo navegador."; msg.className = "msg ok";
  });
  $("logout").addEventListener("click", () => sb.auth.signOut());

  function onSession(s) {
    const cambio = (s?.user?.id || null) !== (session?.user?.id || null);
    session = s;
    if (!s) {
      perfil = null; entries = []; usuarios = [];
      if (channel) { sb.removeChannel(channel); channel = null; }
      renderShell(); return;
    }
    renderShell();
    if (cambio) { $("fecha").value = nowLocal(); loadPerfil(); subscribe(); }
  }
  sb.auth.getSession().then(({ data }) => onSession(data.session));
  sb.auth.onAuthStateChange((_evt, s) => onSession(s));
})();
