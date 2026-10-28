# Bitácora

Aplicación web para la supervisión de trabajos. Cada asiento registra **fecha y hora**, **Descripción** y **Coordinación AAP**, firmado por el usuario **Supervisor** (nombre y empresa).

- Folio correlativo (001, 002…), búsqueda por texto, eliminación con confirmación.
- Datos compartidos en Supabase, con actualización en vivo entre dispositivos.
- Acceso solo para correos autorizados, con enlace mágico (sin contraseña).
- Sitio estático publicado con GitHub Pages.

## Puesta en marcha

1. **Supabase**: crea un proyecto en <https://supabase.com> (plan gratuito).
2. En **SQL Editor**, ejecuta `supabase/schema.sql`. Crea las tablas, el Supervisor por defecto y las reglas de seguridad.
3. En **Authentication → Sign In / Providers**, desactiva *Allow new users to sign up*. Luego, en **Authentication → Users → Invite user**, invita a cada persona que podrá usar la bitácora.
4. En **Authentication → URL Configuration**, pon como *Site URL* la dirección de GitHub Pages (por ejemplo `https://usuario.github.io/bitacora/`).
5. Copia en `config.js` la **Project URL** y la **anon public key** (Project Settings → API).
6. **GitHub Pages**: Settings → Pages → *Deploy from a branch* → `main` / `root`.

## Estructura

| Archivo | Contenido |
|---|---|
| `index.html` | Estructura de la página |
| `styles.css` | Estilos (tema claro y oscuro) |
| `app.js` | Lógica: login, supervisor, asientos |
| `config.js` | URL y anon key de Supabase |
| `manifest.json` | Permite instalarla en el celular |
| `supabase/schema.sql` | Tablas, datos iniciales y políticas RLS |
