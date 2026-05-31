// Clears the preview cookie set by the admin "Preview" button and returns to the
// live site. Linked from the preview banner in BaseLayout.
export const prerender = false;

export async function GET() {
  return new Response(null, {
    status: 302,
    headers: {
      Location: '/',
      'Set-Cookie': 'tb_preview=; Path=/; Max-Age=0; SameSite=Lax',
    },
  });
}
