import { LoginForm } from '@/components/auth/login-form'
import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import { ROUTES } from '@/constants'

export default async function Page() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (user) {
    redirect(ROUTES.PROTECTED)
  }

  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm">
        <LoginForm />
      </div>
    </div>
  )
}
