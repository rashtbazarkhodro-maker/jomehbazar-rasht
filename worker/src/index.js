import { AwsClient } from 'aws4fetch';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // ===== B2 Client =====
    const b2 = new AwsClient({
      accessKeyId: env.B2_KEY_ID,
      secretAccessKey: env.B2_APP_KEY,
      service: 's3',
      region: env.B2_REGION || 'us-east-005'
    });

    function checkAdmin(request, env) {
      const auth = request.headers.get('Authorization') || '';
      const token = auth.replace('Bearer ', '');
      return token === (env.ADMIN_PASSWORD || 'admin1234');
    }

    // ===== آپلود عکس =====
    if (url.pathname === '/api/upload' && request.method === 'POST') {
      try {
        const contentType = request.headers.get('Content-Type') || '';
        if (!contentType.includes('image/')) {
          return Response.json({ error: 'فقط فایل عکس مجاز است' }, { status: 400, headers: corsHeaders });
        }

        const arrayBuffer = await request.arrayBuffer();
        if (arrayBuffer.byteLength > 5 * 1024 * 1024) {
          return Response.json({ error: 'حجم عکس بیش از ۵ مگابایت' }, { status: 400, headers: corsHeaders });
        }

        const ext = contentType.includes('png') ? 'png' : 'jpg';
        const key = `cars/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;
        const b2Url = `https://${env.B2_ENDPOINT}/${env.B2_BUCKET}/${key}`;

        const uploadRes = await b2.fetch(b2Url, {
          method: 'PUT',
          body: arrayBuffer,
          headers: { 'Content-Type': contentType }
        });

        if (!uploadRes.ok) {
          const errText = await uploadRes.text();
          return Response.json({ error: 'خطا در آپلود: ' + errText }, { status: 500, headers: corsHeaders });
        }

        return Response.json({
          success: true,
          key: key,
          url: '/api/images/' + key
        }, { headers: corsHeaders });
      } catch (e) {
        return Response.json({ error: e.message }, { status: 500, headers: corsHeaders });
      }
    }

    // ===== پروکسی عکس از B2 =====
    if (url.pathname.startsWith('/api/images/')) {
      const key = url.pathname.replace('/api/images/', '');
      try {
        const b2Url = `https://${env.B2_ENDPOINT}/${env.B2_BUCKET}/${key}`;
        const imgRes = await b2.fetch(b2Url, { method: 'GET' });
        if (!imgRes.ok) {
          return new Response('Not found', { status: 404 });
        }
        const headers = new Headers();
        headers.set('Content-Type', imgRes.headers.get('Content-Type') || 'image/jpeg');
        headers.set('Cache-Control', 'public, max-age=31536000, immutable');
        return new Response(imgRes.body, { headers });
      } catch (e) {
        return new Response('Error: ' + e.message, { status: 500 });
      }
    }

    // ===== API: لیست خودروهای تایید شده =====
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

    // ===== API: ثبت خودرو جدید =====
    if (url.pathname === '/api/cars' && request.method === 'POST') {
      try {
        const body = await request.json();
        const required = ['title', 'year', 'mileage', 'price', 'phone'];
        for (const field of required) {
          if (!body[field]) {
            return Response.json({ error: `فیلد ${field} الزامی است` }, { status: 400, headers: corsHeaders });
          }
        }
        const images = JSON.stringify(body.images || []);
        const result = await env.DB.prepare(
          `INSERT INTO cars (title, brand, model, year, mileage, price, color, gearbox, fuel, description, images, phone, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`
        ).bind(
          body.title, body.brand || null, body.model || null,
          body.year, body.mileage, body.price,
          body.color || null, body.gearbox || null, body.fuel || null,
          body.description || null, images, body.phone
        ).run();
        return Response.json(
          { success: true, id: result.meta.last_row_id, message: 'آگهی ثبت شد و در انتظار تایید است' },
          { headers: corsHeaders }
        );
      } catch (e) {
        return Response.json({ error: e.message }, { status: 500, headers: corsHeaders });
      }
    }

    // ===== ADMIN: لیست خودروها =====
    if (url.pathname === '/api/admin/cars' && request.method === 'GET') {
      if (!checkAdmin(request, env)) {
        return Response.json({ error: 'دسترسی ندارید' }, { status: 401, headers: corsHeaders });
      }
      const status = url.searchParams.get('status') || 'pending';
      try {
        const { results } = await env.DB.prepare(
          "SELECT * FROM cars WHERE status = ? ORDER BY created_at DESC"
        ).bind(status).all();
        return Response.json({ cars: results }, { headers: corsHeaders });
      } catch (e) {
        return Response.json({ error: e.message }, { status: 500, headers: corsHeaders });
      }
    }

    // ===== ADMIN: آمار =====
    if (url.pathname === '/api/admin/stats' && request.method === 'GET') {
      if (!checkAdmin(request, env)) {
        return Response.json({ error: 'دسترسی ندارید' }, { status: 401, headers: corsHeaders });
      }
      try {
        const pending = await env.DB.prepare("SELECT COUNT(*) as c FROM cars WHERE status='pending'").first();
        const approved = await env.DB.prepare("SELECT COUNT(*) as c FROM cars WHERE status='approved'").first();
        const rejected = await env.DB.prepare("SELECT COUNT(*) as c FROM cars WHERE status='rejected'").first();
        return Response.json({
          pending: pending.c, approved: approved.c, rejected: rejected.c
        }, { headers: corsHeaders });
      } catch (e) {
        return Response.json({ error: e.message }, { status: 500, headers: corsHeaders });
      }
    }

    // ===== ADMIN: تایید/رد/حذف =====
    if (url.pathname.startsWith('/api/admin/cars/') && request.method === 'POST') {
      if (!checkAdmin(request, env)) {
        return Response.json({ error: 'دسترسی ندارید' }, { status: 401, headers: corsHeaders });
      }
      const parts = url.pathname.split('/');
      const id = parts[4];
      const action = parts[5];
      try {
        if (action === 'approve') {
          await env.DB.prepare("UPDATE cars SET status='approved' WHERE id=?").bind(id).run();
        } else if (action === 'reject') {
          await env.DB.prepare("UPDATE cars SET status='rejected' WHERE id=?").bind(id).run();
        } else if (action === 'delete') {
          await env.DB.prepare("DELETE FROM cars WHERE id=?").bind(id).run();
        } else {
          return Response.json({ error: 'اکشن نامعتبر' }, { status: 400, headers: corsHeaders });
        }
        return Response.json({ success: true }, { headers: corsHeaders });
      } catch (e) {
        return Response.json({ error: e.message }, { status: 500, headers: corsHeaders });
      }
    }

    // ===== API: جزئیات یک خودرو =====
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

    return env.ASSETS.fetch(request);
  }
};
