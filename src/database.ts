import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import type { Course, Lesson, Material, Message, Plan, Snapshot } from './domain.js';

export class Store {
  readonly db: DatabaseSync;
  constructor(file: string) {
    this.db = new DatabaseSync(file);
    this.db.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');
    const version = (this.db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version;
    if (version > 1) throw new Error('This database requires a newer version of StudyFlow.');
    if (version === 0) this.db.exec(`BEGIN;
      CREATE TABLE Courses(id TEXT PRIMARY KEY,title TEXT NOT NULL,activeLessonId TEXT,createdAt TEXT NOT NULL,started INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE SourceMaterials(id TEXT PRIMARY KEY,courseId TEXT NOT NULL REFERENCES Courses(id) ON DELETE CASCADE,name TEXT NOT NULL,kind TEXT NOT NULL,text TEXT NOT NULL,images TEXT NOT NULL,warning TEXT NOT NULL);
      CREATE TABLE LearningPaths(id TEXT PRIMARY KEY,courseId TEXT UNIQUE NOT NULL REFERENCES Courses(id) ON DELETE CASCADE);
      CREATE TABLE Lessons(id TEXT PRIMARY KEY,courseId TEXT NOT NULL REFERENCES Courses(id) ON DELETE CASCADE,pathId TEXT NOT NULL REFERENCES LearningPaths(id),position INTEGER NOT NULL,title TEXT NOT NULL,objective TEXT NOT NULL,refs TEXT NOT NULL,UNIQUE(courseId,position));
      CREATE TABLE LessonProgress(lessonId TEXT PRIMARY KEY REFERENCES Lessons(id) ON DELETE CASCADE,status TEXT NOT NULL CHECK(status IN ('not_started','in_progress','completed','needs_review')));
      CREATE TABLE Conversations(id TEXT PRIMARY KEY,lessonId TEXT UNIQUE NOT NULL REFERENCES Lessons(id) ON DELETE CASCADE);
      CREATE TABLE Messages(id TEXT PRIMARY KEY,conversationId TEXT NOT NULL REFERENCES Conversations(id) ON DELETE CASCADE,role TEXT NOT NULL CHECK(role IN ('user','assistant')),content TEXT NOT NULL,status TEXT NOT NULL,createdAt TEXT NOT NULL);
      CREATE TABLE Exercises(id TEXT PRIMARY KEY,lessonId TEXT NOT NULL REFERENCES Lessons(id),prompt TEXT NOT NULL,createdAt TEXT NOT NULL);
      CREATE TABLE ExerciseAttempts(id TEXT PRIMARY KEY,exerciseId TEXT NOT NULL REFERENCES Exercises(id),answer TEXT NOT NULL,feedback TEXT NOT NULL,createdAt TEXT NOT NULL);
      CREATE TABLE Settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
      CREATE TABLE CompletionEvents(id TEXT PRIMARY KEY,lessonId TEXT NOT NULL,previousStatus TEXT NOT NULL,previousActive TEXT,nextActive TEXT,undone INTEGER NOT NULL DEFAULT 0);
      CREATE INDEX message_conversation ON Messages(conversationId,createdAt);
      INSERT INTO Settings VALUES('language','en'),('tutorLanguage','sk'),('theme','dark'),('model','');
      PRAGMA user_version=1; COMMIT;`);
  }
  close() { this.db.close(); }
  transaction<T>(fn: () => T): T { this.db.exec('BEGIN IMMEDIATE'); try { const value = fn(); this.db.exec('COMMIT'); return value; } catch (error) { this.db.exec('ROLLBACK'); throw error; } }
  settings(): Record<string, string> { return Object.fromEntries((this.db.prepare('SELECT key,value FROM Settings').all() as { key: string; value: string }[]).map(row => [row.key, row.value])); }
  setting(key: string, value: string) { this.db.prepare('INSERT INTO Settings VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key, value); }
  courses(): Course[] { return this.db.prepare(`SELECT c.*,count(l.id) total,coalesce(sum(p.status='completed'),0) completed FROM Courses c LEFT JOIN Lessons l ON l.courseId=c.id LEFT JOIN LessonProgress p ON p.lessonId=l.id GROUP BY c.id ORDER BY c.createdAt DESC`).all() as unknown as Course[]; }
  lessons(courseId: string): Lesson[] {
    return (this.db.prepare('SELECT l.*,p.status FROM Lessons l JOIN LessonProgress p ON p.lessonId=l.id WHERE courseId=? ORDER BY position').all(courseId) as unknown as (Lesson & { refs: string })[]).map(row => ({ ...row, references: JSON.parse(row.refs) }));
  }
  lesson(id: string): Lesson {
    const row = this.db.prepare('SELECT courseId FROM Lessons WHERE id=?').get(id) as { courseId: string } | undefined;
    if (!row) throw new Error('Lesson not found.');
    return this.lessons(row.courseId).find(l => l.id === id)!;
  }
  messages(lessonId: string): Message[] { return this.db.prepare('SELECT m.*,c.lessonId FROM Messages m JOIN Conversations c ON c.id=m.conversationId WHERE c.lessonId=? ORDER BY m.rowid').all(lessonId) as unknown as Message[]; }
  materials(courseId: string): Material[] { return (this.db.prepare('SELECT * FROM SourceMaterials WHERE courseId=?').all(courseId) as unknown as (Omit<Material, 'images'> & { images: string })[]).map(row => ({ ...row, images: JSON.parse(row.images) })); }
  snapshot(courseId?: string): Snapshot {
    const settings = this.settings();
    const courses = this.courses();
    const course = courses.find(c => c.id === (courseId ?? settings.activeCourse)) ?? null;
    return { courses, course, lessons: course ? this.lessons(course.id) : [], messages: course?.activeLessonId ? this.messages(course.activeLessonId) : [], sources: course ? this.materials(course.id).map(({ id, name, warning }) => ({ id, name, warning })) : [], settings };
  }
  create(material: Material, plan: Plan) {
    return this.transaction(() => {
      const id = randomUUID(), path = randomUUID();
      this.db.prepare('INSERT INTO Courses(id,title,createdAt) VALUES(?,?,?)').run(id, plan.title, new Date().toISOString());
      this.db.prepare('INSERT INTO LearningPaths VALUES(?,?)').run(path, id);
      this.db.prepare('INSERT INTO SourceMaterials VALUES(?,?,?,?,?,?,?)').run(material.id, id, material.name, material.kind, material.text, JSON.stringify(material.images), material.warning);
      this.insertLessons(id, path, plan);
      this.setting('activeCourse', id);
      return this.snapshot(id);
    });
  }
  private insertLessons(courseId: string, path: string, plan: Plan) {
    plan.lessons.forEach((lesson, position) => {
      const id = randomUUID();
      this.db.prepare('INSERT INTO Lessons VALUES(?,?,?,?,?,?,?)').run(id, courseId, path, position, lesson.title, lesson.objective, JSON.stringify(lesson.references));
      this.db.prepare('INSERT INTO LessonProgress VALUES(?,?)').run(id, 'not_started');
      this.db.prepare('INSERT INTO Conversations VALUES(?,?)').run(randomUUID(), id);
    });
  }
  editPlan(courseId: string, plan: Plan) {
    return this.transaction(() => {
      const course = this.courses().find(c => c.id === courseId);
      if (!course || course.started) throw new Error('Only an unstarted learning path can be edited.');
      const path = this.db.prepare('SELECT id FROM LearningPaths WHERE courseId=?').get(courseId) as { id: string };
      this.db.prepare('DELETE FROM Lessons WHERE courseId=?').run(courseId);
      this.db.prepare('UPDATE Courses SET title=? WHERE id=?').run(plan.title, courseId);
      this.insertLessons(courseId, path.id, plan);
      return this.snapshot(courseId);
    });
  }
  activate(lessonId: string) {
    const lesson = this.lesson(lessonId);
    return this.transaction(() => {
      this.db.prepare('UPDATE Courses SET activeLessonId=?,started=1 WHERE id=?').run(lessonId, lesson.courseId);
      this.db.prepare("UPDATE LessonProgress SET status='in_progress' WHERE lessonId=? AND status='not_started'").run(lessonId);
      this.setting('activeCourse', lesson.courseId);
      return this.snapshot(lesson.courseId);
    });
  }
  complete(lessonId: string, operationId: string) {
    return this.transaction(() => {
      const lesson = this.lesson(lessonId);
      if (this.db.prepare('SELECT id FROM CompletionEvents WHERE id=?').get(operationId)) return this.snapshot(lesson.courseId);
      const course = this.courses().find(c => c.id === lesson.courseId)!;
      if (course.activeLessonId !== lessonId) throw new Error('The active lesson changed. Refresh before completing it.');
      const others = this.lessons(lesson.courseId).filter(l => l.id !== lessonId && l.status !== 'completed');
      const next = others.find(l => l.position > lesson.position) ?? others[0];
      this.db.prepare('INSERT INTO CompletionEvents VALUES(?,?,?,?,?,0)').run(operationId, lessonId, lesson.status, course.activeLessonId, next?.id ?? null);
      this.db.prepare("UPDATE LessonProgress SET status='completed' WHERE lessonId=?").run(lessonId);
      this.db.prepare('UPDATE Courses SET activeLessonId=? WHERE id=?').run(next?.id ?? null, lesson.courseId);
      if (next) this.db.prepare("UPDATE LessonProgress SET status='in_progress' WHERE lessonId=? AND status='not_started'").run(next.id);
      return this.snapshot(lesson.courseId);
    });
  }
  undo(operationId: string) {
    return this.transaction(() => {
      const event = this.db.prepare('SELECT * FROM CompletionEvents WHERE id=?').get(operationId) as { lessonId: string; previousStatus: string; undone: number } | undefined;
      if (!event) throw new Error('Completion event not found.');
      const lesson = this.lesson(event.lessonId);
      if (!event.undone) {
        this.db.prepare('UPDATE LessonProgress SET status=? WHERE lessonId=?').run(event.previousStatus, lesson.id);
        this.db.prepare('UPDATE Courses SET activeLessonId=? WHERE id=?').run(lesson.id, lesson.courseId);
        this.db.prepare('UPDATE CompletionEvents SET undone=1 WHERE id=?').run(operationId);
      }
      return this.snapshot(lesson.courseId);
    });
  }
  mark(lessonId: string, status: 'in_progress' | 'needs_review') {
    const lesson = this.lesson(lessonId);
    this.db.prepare('UPDATE LessonProgress SET status=? WHERE lessonId=?').run(status, lessonId);
    return this.snapshot(lesson.courseId);
  }
  addMessage(lessonId: string, role: Message['role'], content: string, status: Message['status'] = 'complete') {
    const conversation = this.db.prepare('SELECT id FROM Conversations WHERE lessonId=?').get(lessonId) as { id: string } | undefined;
    if (!conversation) throw new Error('Conversation not found.');
    this.db.prepare('INSERT INTO Messages VALUES(?,?,?,?,?,?)').run(randomUUID(), conversation.id, role, content, status, new Date().toISOString());
  }
  exercise(lessonId: string, prompt: string) { const id = randomUUID(); this.db.prepare('INSERT INTO Exercises VALUES(?,?,?,?)').run(id, lessonId, prompt, new Date().toISOString()); return id; }
  attempt(exerciseId: string, answer: string, feedback: string) { this.db.prepare('INSERT INTO ExerciseAttempts VALUES(?,?,?,?,?)').run(randomUUID(), exerciseId, answer, feedback, new Date().toISOString()); }
}
