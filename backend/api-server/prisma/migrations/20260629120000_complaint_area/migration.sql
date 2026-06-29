-- Store locality on complaints: Motavaracha, Saroli, or Vesu.
ALTER TABLE "complaints" ADD COLUMN "area" TEXT NOT NULL DEFAULT '';
