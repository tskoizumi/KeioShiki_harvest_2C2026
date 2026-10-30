// 運命、賄賂で買いませんか？ — 受付・縁・占いのサーバー（Cloudflare Workers）
// URLを見て、客のAPI／スタッフのAPI／画面に振り分ける
// 研修用のホスト名（TRAINING_HOSTS）で来た要求は、別のデータベースに向けて同じ処理をする（training.js）
// 写真展のホスト名（PHOTO_HOSTS）で来た要求は、写真の受け渡しサイト（photo.js）

import { ApiError, fail } from './util.js';
import { currentStaff } from './auth.js';
import * as pub from './routes/public.js';
import * as staffRoutes from './routes/staff.js';
import { isTraining, trainingFetch } from './training.js';
export { TrainingDb } from './training-do.js';
import { isPhotoHost, photoFetch } from './photo.js';
export { PhotoStore } from './photo-do.js';

export default {
  async fetch(request, env, ctx) {
    if (isPhotoHost(request, env)) return photoFetch(request, env);   // 写真展（別のサイト）
    if (isTraining(request, env)) return trainingFetch(request, env, ctx, handle);
    return handle(request, env, ctx);
  },
};

async function handle(request, env, ctx) {
  const url = new URL(request.url);
  const p = url.pathname;
  const m = request.method;
  try {
    /* ---------- 客のAPI ---------- */
    if (p === '/api/register' && m === 'POST') return await pub.register(request, env);
    let mm;
    if ((mm = p.match(/^\/api\/u\/([A-Za-z0-9_-]+)\/login$/)) && m === 'POST') return await pub.login(request, env, mm[1]);
    if ((mm = p.match(/^\/api\/u\/([A-Za-z0-9_-]+)$/)) && m === 'GET') return await pub.me(request, env, mm[1]);
    if (p === '/api/config' && m === 'GET') return await pub.config(env);
    if (p === '/api/rankings' && m === 'GET') return await pub.rankingsRoute(env);
    if (p === '/api/ranking' && m === 'GET') return await pub.lpRankingRoute(env);
    if ((p === '/api/ranking' || p === '/api/rankings' || p === '/api/config') && m === 'OPTIONS') return pub.corsPreflight();

    /* ---------- スタッフのAPI ---------- */
    if (p === '/api/staff/bootstrap' && m === 'GET') return await staffRoutes.bootstrapState(env);
    if (p === '/api/staff/setup' && m === 'POST') return await staffRoutes.setup(request, env);
    if (p === '/api/staff/login' && m === 'POST') return await staffRoutes.login(request, env);
    if (p === '/api/staff/logout' && m === 'POST') return staffRoutes.logout(request);
    if ((mm = p.match(/^\/api\/staff\/join\/([A-Za-z0-9]+)$/))) {
      if (m === 'GET') return await staffRoutes.inviteInfo(env, mm[1]);
      if (m === 'POST') return await staffRoutes.join(request, env, mm[1]);
    }
    if (p.startsWith('/api/staff/')) {
      const staff = await currentStaff(request, env);
      if (!staff) return fail('LOGIN', 'スタッフとしてログインしてください', 401);
      return await staffRoutes.handle(request, env, url, staff);
    }
    if (p.startsWith('/api/')) return fail('NOT_FOUND', 'そのAPIはありません', 404);

    /* ---------- 画面（public/ の静的ファイル） ----------
       .html を付けて取りに行くと .html なしのURLへ転送されるので、必ず .html なしで取る */
    if (p.startsWith('/u/')) return env.ASSETS.fetch(new Request(new URL('/u', url), request));
    if (p === '/staff' || p === '/staff/') return env.ASSETS.fetch(new Request(new URL('/staff', url), request));
    if (p === '/staff/cards') return env.ASSETS.fetch(new Request(new URL('/cards', url), request));
    if (p === '/staff/join') return env.ASSETS.fetch(new Request(new URL('/join', url), request));
    if (p === '/photo' || p.startsWith('/photo/')) {   // 写真展の画面は photo. のホストだけ
      const nf = await env.ASSETS.fetch(new Request(new URL('/404', url), request));
      return new Response(nf.body, { status: 404, headers: nf.headers });
    }
    if (p === '/training' || p === '/training/') {   // 手引きは研修ホストだけ
      const nf = await env.ASSETS.fetch(new Request(new URL('/404', url), request));
      return new Response(nf.body, { status: 404, headers: nf.headers });
    }
    return env.ASSETS.fetch(request);
  } catch (e) {
    if (e instanceof ApiError) return fail(e.code, e.message, e.status);
    console.error(e);
    return fail('INTERNAL', 'サーバーでエラーが起きました', 500);
  }
}
