import { Router } from "express";
import { z } from "zod";
import { and, asc, count, eq, max } from "drizzle-orm";
import type { Deps } from "../deps.js";
import { ah } from "../lib/http.js";
import { validate } from "../middleware/validate.js";
import { authenticate } from "../middleware/auth.js";
import { badRequest, notFound } from "../lib/errors.js";
import { invalidateLeaderboard } from "./points.js";
import { lessonProgress, modules, questions, quizAttempts } from "../db/schema.js";

/** Q6 (Create) is self-assessed: it scores when the response is substantive and ≥3 rubric criteria are ticked. */
const attemptSchema = z.object({
  answers: z.record(z.string().regex(/^\d+$/), z.number().int().min(0).max(9)),
  open: z.object({ text: z.string().max(5000), rubric: z.array(z.number().int().min(0).max(9)).max(10) }).optional(),
});

export function coursesRouter(d: Deps) {
  const r = Router(); const auth = authenticate(d.config.JWT_ACCESS_SECRET); const optional = authenticate(d.config.JWT_ACCESS_SECRET, false);
  const getModule = async (id: string) => { const m = await d.db.query.modules.findFirst({ where: eq(modules.id, id) }); if (!m) throw notFound("Module"); return m; };
  const getQuestions = (id: string) => d.db.select().from(questions).where(eq(questions.moduleId, id)).orderBy(asc(questions.order));

  r.get("/", optional, ah(async (req, res) => {
    const list = await d.db.select().from(modules).orderBy(asc(modules.order));
    let lp: { moduleId: string; n: number }[] = [], qa: { moduleId: string; best: number | null }[] = [];
    if (req.user) [lp, qa] = await Promise.all([
      d.db.select({ moduleId: lessonProgress.moduleId, n: count() }).from(lessonProgress).where(eq(lessonProgress.userId, req.user.id)).groupBy(lessonProgress.moduleId),
      d.db.select({ moduleId: quizAttempts.moduleId, best: max(quizAttempts.score) }).from(quizAttempts).where(eq(quizAttempts.userId, req.user.id)).groupBy(quizAttempts.moduleId),
    ]);
    res.json({ modules: list.map(({ lessons, outcomes, ...m }) => ({ ...m, lessonCount: lessons.length, outcomes,
      progress: req.user ? { lessons: lp.find((x) => x.moduleId === m.id)?.n ?? 0, best: qa.find((x) => x.moduleId === m.id)?.best ?? null } : null })) });
  }));

  r.get("/:id", optional, ah(async (req, res) => {
    const m = await getModule(req.params.id); const qs = await getQuestions(m.id);
    const done = req.user ? (await d.db.select({ i: lessonProgress.lessonIndex }).from(lessonProgress).where(and(eq(lessonProgress.userId, req.user.id), eq(lessonProgress.moduleId, m.id)))).map((x) => x.i) : [];
    // Answer keys and explanations are withheld until an attempt is submitted.
    res.json({ module: { ...m, questions: qs.map((q) => ({ order: q.order, level: q.level, lo: q.lo, prompt: q.prompt, options: q.options, open: q.open, rubric: q.open ? q.rubric : undefined })) }, completedLessons: done });
  }));

  r.post("/:id/lessons/:idx/complete", auth, ah(async (req, res) => {
    const m = await getModule(req.params.id);
    const idx = Number(req.params.idx); if (!Number.isInteger(idx) || idx < 0 || idx >= m.lessons.length) throw badRequest("No such lesson");
    await d.db.insert(lessonProgress).values({ userId: req.user!.id, moduleId: m.id, lessonIndex: idx }).onConflictDoNothing();
    res.json({ ok: true });
  }));

  r.post("/:id/attempts", auth, validate({ body: attemptSchema }), ah(async (req, res) => {
    const m = await getModule(req.params.id); const qs = await getQuestions(m.id);
    const { answers, open } = req.body as z.infer<typeof attemptSchema>;
    const missing = qs.filter((q) => !q.open && answers[String(q.order)] === undefined);
    if (missing.length) throw badRequest(`Answer every multiple-choice question (${missing.length} left)`);
    const results = qs.map((q) => q.open
      ? { order: q.order, open: true, correct: !!open && open.text.trim().length >= 40 && new Set(open.rubric).size >= 3, model: q.model, rubric: q.rubric }
      : { order: q.order, chosen: answers[String(q.order)], answer: q.answerIndex, correct: answers[String(q.order)] === q.answerIndex, explanation: q.explanation });
    const score = results.filter((x) => x.correct).length;
    const [{ prev }] = await d.db.select({ prev: max(quizAttempts.score) }).from(quizAttempts).where(and(eq(quizAttempts.userId, req.user!.id), eq(quizAttempts.moduleId, m.id)));
    await d.db.insert(quizAttempts).values({ userId: req.user!.id, moduleId: m.id, score, answers: { answers, open: open ?? null } });
    const best = Math.max(prev ?? 0, score);
    if (best > (prev ?? 0)) await invalidateLeaderboard(d);
    res.status(201).json({ score, outOf: qs.length, passed: score >= 4, best, results });
  }));
  return r;
}
