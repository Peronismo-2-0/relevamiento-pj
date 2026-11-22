# Relevamiento Territorial (PWA offline-first, costo $0)

## Estructura
```
relevamiento-pj/
├─ supabase/
│  ├─ schema.sql                      # tablas, RLS, auditoría, RPC
│  └─ functions/admin-create-user/    # alta de cuentas (única vía)
├─ public/geojson/                    # circuitos de Capital (GeoJSON)
├─ src/
│  ├─ lib/ supabase.js db.js sync.js auth.jsx constantes.js
│  ├─ components/Shell.jsx            # estado online/pendientes
│  ├─ pages/ Login.jsx Mapa.jsx Admin.jsx
│  ├─ App.jsx  main.jsx  styles.css
├─ .github/workflows/deploy.yml       # GitHub Pages
├─ vite.config.js (PWA + cache de mapa)  package.json  .env.example
```

## Puesta en marcha
1. Crear proyecto en supabase.com (plan Free). Auth > Providers > Email: **desactivar "Allow new users to sign up"**.
2. SQL Editor: pegar y ejecutar `supabase/schema.sql`.
3. Crear tu usuario en Auth > Users y registrar el perfil super_admin (última línea del SQL).
4. `npm i -g supabase && supabase functions deploy admin-create-user`.
5. Copiar `.env.example` a `.env` con URL y anon key. `npm install && npm run dev`.
6. Subir a GitHub, agregar los secrets `VITE_SUPABASE_*`, activar Pages (Source: GitHub Actions). Ajustar `base` en vite.config.js al nombre del repo.
7. Importar circuitos: convertir cada GeoJSON a filas de `zonas` (`ST_GeomFromGeoJSON`) desde el SQL Editor.
8. Agregar `icon-192.png` y `icon-512.png` en `/public`.

## Pendiente (próximas iteraciones)
Asignación de zonas en el panel, listado/export de relevamientos (con `log_audit('exportar')`), visor de auditoría, cache de tiles offline por zona, pantalla de reportes.

## Datos personales
Las opiniones políticas son datos sensibles (Ley 25.326). Antes de usar en campo: texto de consentimiento/finalidad en el formulario, inscripción de la base en la AAIP, política de acceso y retención, y capacitación a militantes. El DNI es opcional por diseño: considerá no pedirlo.
