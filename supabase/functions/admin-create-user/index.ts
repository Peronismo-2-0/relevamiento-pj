// supabase functions deploy admin-create-user
// Única vía para crear cuentas (el signup público debe estar DESACTIVADO en Auth > Providers > Email).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type' }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const url = Deno.env.get('SUPABASE_URL')!
  const caller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization')! } }
  })
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  const { data: { user } } = await caller.auth.getUser()
  if (!user) return new Response('No autorizado', { status: 401, headers: cors })
  const { data: yo } = await admin.from('perfiles').select('rol, junta_id, activo').eq('id', user.id).single()
  if (!yo?.activo || !['super_admin', 'coordinador'].includes(yo.rol))
    return new Response('Sin permisos', { status: 403, headers: cors })

  const { email, password, nombre, rol, junta_id } = await req.json()
  // El coordinador solo crea militantes de su propia junta
  if (yo.rol === 'coordinador' && (rol !== 'militante' || junta_id !== yo.junta_id))
    return new Response('Sin permisos para ese rol/junta', { status: 403, headers: cors })

  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
  if (error) return new Response(error.message, { status: 400, headers: cors })
  await admin.from('perfiles').insert({ id: data.user.id, nombre, rol, junta_id })
  await admin.from('audit_log').insert({
    usuario_id: user.id, accion: 'usuario.crear', detalle: { nuevo: data.user.id, rol, junta_id },
    ip: (req.headers.get('x-forwarded-for') ?? '').split(',')[0], dispositivo: req.headers.get('user-agent')
  })
  return new Response(JSON.stringify({ id: data.user.id }), { headers: { ...cors, 'Content-Type': 'application/json' } })
})
