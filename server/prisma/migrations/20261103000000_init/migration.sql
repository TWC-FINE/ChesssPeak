-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "game_status" AS ENUM ('waiting', 'active', 'finished', 'aborted');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "username" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "games" (
    "id" UUID NOT NULL,
    "status" "game_status" NOT NULL DEFAULT 'waiting',
    "result" TEXT,
    "termination" TEXT,
    "white_user_id" UUID,
    "white_guest_id" UUID,
    "white_name" TEXT,
    "black_user_id" UUID,
    "black_guest_id" UUID,
    "black_name" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMPTZ(6),

    CONSTRAINT "games_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE INDEX "games_status_idx" ON "games"("status");

-- AddForeignKey
ALTER TABLE "games" ADD CONSTRAINT "games_white_user_id_fkey" FOREIGN KEY ("white_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "games" ADD CONSTRAINT "games_black_user_id_fkey" FOREIGN KEY ("black_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

