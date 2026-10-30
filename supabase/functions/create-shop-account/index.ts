import { createClient } from 'npm:@supabase/supabase-js@2'

const allowedOrigins = new Set([
  'https://barbearia-eight-sigma.vercel.app',
  'http://localhost:3000',
])

function response(body: unknown, status: number, origin: string) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Vary': 'Origin',
    },
  })
}

Deno.serve(async (request: Request) => {
  const requestOrigin = request.headers.get('Origin') ?? ''
  if (!allowedOrigins.has(requestOrigin)) {
    return new Response('Forbidden origin', { status: 403 })
  }

  if (request.method === 'OPTIONS') return response({ ok: true }, 200, requestOrigin)
  if (request.method !== 'POST') return response({ error: 'Method not allowed' }, 405, requestOrigin)

  const authorization = request.headers.get('Authorization')
  if (!authorization?.startsWith('Bearer ')) return response({ error: 'Faça login como ADM.' }, 401, requestOrigin)

  const projectUrl = Deno.env.get('SUPABASE_URL')
  const publishableKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!projectUrl || !publishableKey || !serviceRoleKey) {
    return response({ error: 'A função não está configurada corretamente.' }, 500, requestOrigin)
  }

  const userClient = createClient(projectUrl, publishableKey, {
    global: { headers: { Authorization: authorization } },
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const adminClient = createClient(projectUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const accessToken = authorization.slice('Bearer '.length)
  const { data: userData, error: userError } = await userClient.auth.getUser(accessToken)
  if (userError || !userData.user) return response({ error: 'Sessão inválida. Entre novamente como ADM.' }, 401, requestOrigin)

  const { data: adminRecord, error: adminError } = await adminClient
    .from('barber_admins')
    .select('user_id')
    .eq('user_id', userData.user.id)
    .maybeSingle()
  if (adminError) return response({ error: 'Não foi possível validar o perfil ADM.' }, 500, requestOrigin)
  if (!adminRecord) return response({ error: 'Somente o ADM pode criar acessos de barbearia.' }, 403, requestOrigin)

  let input: Record<string, unknown>
  try {
    input = await request.json()
  } catch {
    return response({ error: 'Confira os dados do cadastro.' }, 400, requestOrigin)
  }

  const name = typeof input.name === 'string' ? input.name.trim() : ''
  const slug = typeof input.slug === 'string' ? input.slug.trim() : ''
  const whatsapp = typeof input.whatsapp === 'string' ? input.whatsapp.trim() : ''
  const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : ''
  const password = typeof input.password === 'string' ? input.password : ''

  if (name.length < 2 || name.length > 100) return response({ error: 'O nome deve ter entre 2 e 100 caracteres.' }, 400, requestOrigin)
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 60) return response({ error: 'Use um link com letras minúsculas, números e hífens.' }, 400, requestOrigin)
  if (whatsapp.replace(/\D/g, '').length < 10 || whatsapp.replace(/\D/g, '').length > 20) return response({ error: 'Informe um WhatsApp válido com DDD.' }, 400, requestOrigin)
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return response({ error: 'Informe um e-mail válido.' }, 400, requestOrigin)
  if (password.length < 8 || password.length > 72) return response({ error: 'A senha deve ter entre 8 e 72 caracteres.' }, 400, requestOrigin)

  const { data: existingShop, error: slugError } = await adminClient
    .from('barbershops')
    .select('id')
    .eq('slug', slug)
    .maybeSingle()
  if (slugError) return response({ error: 'Não foi possível validar o link da barbearia.' }, 500, requestOrigin)
  if (existingShop) return response({ error: 'Esse link já está sendo usado por outra barbearia.' }, 409, requestOrigin)

  const { data: createdUserData, error: createUserError } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { shop_name: name },
  })
  if (createUserError || !createdUserData.user) {
    const status = createUserError?.code === 'email_exists' || createUserError?.code === 'user_already_exists' ? 409 : 400
    return response({ error: status === 409 ? 'Já existe uma conta com esse e-mail.' : 'Não foi possível criar a conta. Confira o e-mail e a senha.' }, status, requestOrigin)
  }

  const shopUserId = createdUserData.user.id
  const { data: shop, error: shopError } = await adminClient
    .from('barbershops')
    .insert({ name, slug, whatsapp, created_by: shopUserId })
    .select('id, name, slug, whatsapp, instagram_url, address, city, state, about, active')
    .single()

  if (shopError || !shop) {
    await adminClient.auth.admin.deleteUser(shopUserId)
    const status = shopError?.code === '23505' ? 409 : 500
    return response({ error: status === 409 ? 'Esse link acabou de ser usado. Escolha outro.' : 'Não foi possível criar o perfil da barbearia.' }, status, requestOrigin)
  }

  const { error: memberError } = await adminClient
    .from('barber_shop_members')
    .insert({ shop_id: shop.id, user_id: shopUserId, role: 'owner' })
  if (memberError) {
    await adminClient.from('barbershops').delete().eq('id', shop.id)
    await adminClient.auth.admin.deleteUser(shopUserId)
    return response({ error: 'Não foi possível habilitar o acesso da barbearia.' }, 500, requestOrigin)
  }

  const { error: hoursError } = await adminClient
    .from('business_hours')
    .insert({ shop_id: shop.id, days: [1, 2, 3, 4, 5, 6], open_time: '09:00', close_time: '19:00', slot_step: 30 })
  if (hoursError) {
    await adminClient.from('barbershops').delete().eq('id', shop.id)
    await adminClient.auth.admin.deleteUser(shopUserId)
    return response({ error: 'Não foi possível configurar o expediente inicial.' }, 500, requestOrigin)
  }

  return response({ shop }, 201, requestOrigin)
})
