(() => {
  const $ = id => document.getElementById(id);
  const cfg = window.BITACORA_CONFIG || {};
  const notice = t => { $("notice").textContent = t || ""; $("notice").hidden = !t; };

  if (!cfg.SUPABASE_URL || cfg.SUPABASE_URL.includes("TU-PROYECTO")) {
    notice("Falta configurar Supabase en config.js (URL y anon key).");
    return;
  }
  const sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);

  let sup = { nombre: "", empresa: "" }, entries = [], channel = null;

  const pad = n => String(n).padStart(2, "0");
  const nowLocal = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  const fmt = iso => {
    const d = new Date(iso); if (isNaN(d)) return { day: "—", time: "" };
    return { day: d.toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" }),
             time: d.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" }) };
  };

  // ---------- Render ----------
  function renderSup() {
    const n = $("supNombre"), e = $("supEmpresa");
    n.textContent = sup.nombre || "Sin definir"; n.classList.toggle("pending", !sup.nombre);
    e.textContent = sup.empresa || "Sin definir"; e.classList.toggle("pending", !sup.empresa);
  }

  function render() {
    const q = $("search").value.trim().toLowerCase();
    const numbered = entries.map((e, i) => ({ ...e, folio: i + 1 }));
    const list = numbered.filter(e => !q || (e.descripcion || "").toLowerCase().includes(q) || (e.coordinacion_aap || "").toLowerCase().includes(q)).reverse();
    $("count").textContent = entries.length;
    const box = $("folios"); box.replaceChildren();
    if (!list.length) {
      const d = document.createElement("div"); d.className = "empty";
      d.innerHTML = q ? "<strong>Sin resultados</strong>Ningún asiento coincide con la búsqueda."
                      : "<strong>Sin asientos todavía</strong>Registra el primer trabajo supervisado con el formulario de arriba.";
      box.append(d); return;
    }
    for (const e of list) {
      const f = fmt(e.fecha);
      const art = document.createElement("article"); art.className = "folio";
      art.innerHTML = `<div class="folio-n"><span class="label">Folio</span><span class="n"></span><span class="d" style="white-space:pre-line"></span></div>
        <div class="folio-b"><div><div class="label">Descripción</div><p class="desc"></p></div>
        <div class="aap"><div class="label">Coordinación AAP</div><p class="aapt"></p></div>
        <div class="folio-f"><span class="firma"></span><button class="danger" type="button">Eliminar</button></div></div>`;
      art.querySelector(".n").textContent = String(e.folio).padStart(3, "0");
      art.querySelector(".d").textContent = `${f.day}\n${f.time}`;
      art.querySelector(".desc").textContent = e.descripcion || "";
      art.querySelector(".aapt").textContent = e.coordinacion_aap || "Sin coordinación registrada";
      art.querySelector(".firma").textContent = `Supervisor: ${e.supervisor_nombre || "—"} · ${e.supervisor_empresa || "—"}`;
      const del = art.querySelector(".danger");
      let armed = null;
      del.addEventListener("click", async () => {
        if (!armed) {
          del.textContent = "¿Confirmar eliminación?"; del.classList.add("confirm");
          armed = setTimeout(() => { armed = null; del.textContent = "Eliminar"; del.classList.remove("confirm"); }, 4000);
          return;
        }
        clearTimeout(armed); del.disabled = true;
        const { error } = await sb.from("registros").delete().eq("id", e.id);
        if (error) { del.disabled = false; notice("No se pudo eliminar el asiento: " + error.message); }
        else loadRegistros();
      });
      box.append(art);
    }
  }

  // ---------- Data ----------
  async function loadSup() {
    const { data, error } = await sb.from("supervisores").select("nombre,empresa").eq("id", "supervisor").maybeSingle();
    if (error) { notice("No se pudo leer el supervisor: " + error.message); return; }
    sup = { nombre: data?.nombre || "", empresa: data?.empresa || "" };
    renderSup();
  }
  async function loadRegistros() {
    const { data, error } = await sb.from("registros").select("*").order("fecha", { ascending: true }).limit(5000);
    if (error) { notice("No se pudieron leer los asientos: " + error.message); return; }
    entries = data || []; render();
  }
  function subscribe() {
    if (channel) return;
    channel = sb.channel("bitacora")
      .on("postgres_changes", { event: "*", schema: "public", table: "registros" }, loadRegistros)
      .on("postgres_changes", { event: "*", schema: "public", table: "supervisores" }, loadSup)
      .subscribe();
  }

  // ---------- UI events ----------
  $("search").addEventListener("input", render);

  $("supEditBtn").addEventListener("click", () => {
    $("supNombreIn").value = sup.nombre; $("supEmpresaIn").value = sup.empresa;
    $("supView").hidden = true; $("supEditBtn").hidden = true; $("supForm").hidden = false; $("supNombreIn").focus();
  });
  const closeSup = () => { $("supView").hidden = false; $("supEditBtn").hidden = false; $("supForm").hidden = true; };
  $("supCancel").addEventListener("click", closeSup);
  $("supForm").addEventListener("submit", async ev => {
    ev.preventDefault();
    const row = { id: "supervisor", rol: "Supervisor", nombre: $("supNombreIn").value.trim(), empresa: $("supEmpresaIn").value.trim(), updated_at: new Date().toISOString() };
    const { error } = await sb.from("supervisores").upsert(row);
    if (error) { notice("No se pudieron guardar los datos del supervisor: " + error.message); return; }
    sup = { nombre: row.nombre, empresa: row.empresa }; renderSup(); closeSup();
  });

  $("entryForm").addEventListener("submit", async ev => {
    ev.preventDefault();
    const msg = $("entryMsg");
    if (!sup.nombre) { msg.textContent = "Primero define el nombre y la empresa del supervisor."; msg.className = "msg err"; return; }
    const fecha = new Date($("fecha").value);
    const row = {
      fecha: isNaN(fecha) ? new Date().toISOString() : fecha.toISOString(),
      descripcion: $("descripcion").value.trim(),
      coordinacion_aap: $("aap").value.trim(),
      supervisor_nombre: sup.nombre,
      supervisor_empresa: sup.empresa
    };
    if (!row.descripcion) return;
    $("saveBtn").disabled = true;
    const { error } = await sb.from("registros").insert(row);
    $("saveBtn").disabled = false;
    if (error) { msg.textContent = "No se pudo registrar el asiento: " + error.message; msg.className = "msg err"; return; }
    $("descripcion").value = ""; $("aap").value = ""; $("fecha").value = nowLocal();
    msg.textContent = "Asiento registrado."; msg.className = "msg ok";
    loadRegistros();
  });

  // ---------- Auth ----------
  $("authForm").addEventListener("submit", async ev => {
    ev.preventDefault();
    const email = $("email").value.trim();
    $("authBtn").disabled = true;
    const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + location.pathname, shouldCreateUser: false } });
    $("authBtn").disabled = false;
    $("authMsg").className = error ? "msg err" : "msg ok";
    $("authMsg").textContent = error
      ? (/signups not allowed|not found/i.test(error.message) ? "Ese correo no está autorizado. Pide acceso al administrador." : "No se pudo enviar el enlace: " + error.message)
      : "Revisa tu correo y abre el enlace para entrar.";
  });
  $("logout").addEventListener("click", () => sb.auth.signOut());

  function showSession(session) {
    const logged = !!session;
    $("authForm").hidden = logged;
    $("app").hidden = !logged;
    $("session").hidden = !logged;
    $("sessionEmail").textContent = session?.user?.email || "";
    if (logged) { $("fecha").value = nowLocal(); loadSup(); loadRegistros(); subscribe(); }
    else { entries = []; $("count").textContent = "0"; if (channel) { sb.removeChannel(channel); channel = null; } }
  }
  sb.auth.getSession().then(({ data }) => showSession(data.session));
  sb.auth.onAuthStateChange((_evt, session) => showSession(session));
})();
