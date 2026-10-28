# Bitácora

Aplicación web para la supervisión de trabajos. Cada asiento registra **fecha y hora**, **Descripción** y **Coordinación AAP**, queda a nombre de quien lo registró y un Supervisor firma su revisión.

## Roles

| Rol | Puede |
|---|---|
| **Administrador** | Todo lo anterior + asignar roles y eliminar asientos |
| **Supervisor** | Ver y registrar asientos, **firmar la revisión** |
| **Operador** | Ver y registrar asientos |
| Pendiente | Solo completar su nombre y empresa, mientras espera aprobación |
| Sin acceso | Nada |

Cualquiera puede entrar con su correo y queda **Pendiente** hasta que el Administrador le asigna un rol desde la sección **Usuarios** de la app. Los permisos los aplica la base de datos (no solo la página).

## Puesta en marcha

1. **Supabase**: crea un proyecto en <https://supabase.com>.
2. En **SQL Editor**, ejecuta en orden `supabase/schema.sql` y `supabase/02_roles.sql`.
3. En **Authentication → Sign In / Providers**, activa *Allow new users to sign up*.
4. En **Authentication → URL Configuration**, pon la dirección de GitHub Pages en *Site URL* y *Redirect URLs*.
5. Copia en `config.js` la **Project URL** y la **publishable key**.
6. **GitHub Pages**: Settings → Pages → *Deploy from a branch* → `main` / `root`.

## Estructura

| Archivo | Contenido |
|---|---|
| `index.html` | Estructura de la página |
| `styles.css` | Estilos (tema claro y oscuro) |
| `app.js` | Lógica: ingreso por enlace, perfiles, roles, asientos y firmas |
| `config.js` | URL y publishable key de Supabase |
| `manifest.json`, `icons/` | Instalación en el celular (Android e iPhone) |
| `supabase/schema.sql` | Tablas base |
| `supabase/02_roles.sql` | Perfiles, roles, firma de revisión y permisos |

> En iPhone, usa la Bitácora desde Safari: la app instalada en la pantalla de inicio no comparte la sesión que abre el enlace del correo.
