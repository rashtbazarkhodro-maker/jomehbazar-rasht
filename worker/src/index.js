export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // API: لیست خودروهای تایید شده
    if (url.pathname === '/api/cars' && request.method === 'GET') {
      try {
        const { results } = await env.DB.prepare(
          "SELECT * FROM cars WHERE status = 'approved' ORDER BY created_at DESC"
        ).all();
        return Response.json({ cars: results }, { headers: corsHeaders });
      } catch (e) {
        return Response.json({ error: e.message }, { status: 500, headers: corsHeaders });
      }
    }

    // API: جزئیات یک خودرو
    if (url.pathname.startsWith('/api/cars/') && request.method === 'GET') {
      const id = url.pathname.split('/')[3];
      try {
        const car = await env.DB.prepare(
          "SELECT * FROM cars WHERE id = ? AND status = 'approved'"
        ).bind(id).first();
        if (!car) {
          return Response.json({ error: 'خودرو پیدا نشد' }, { status: 404, headers: corsHeaders });
        }
        return Response.json({ car }, { headers: corsHeaders });
      } catch (e) {
        return Response.json({ error: e.message }, { status: 500, headers: corsHeaders });
      }
    }

    // بقیه درخواست‌ها → فایل‌های استاتیک
    return env.ASSETS.fetch(request);
  }
};
