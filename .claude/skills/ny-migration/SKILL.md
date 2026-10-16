---
name: ny-migration
description: Opret næste nummererede Prisma-migration og tjek, at prediction-ledgeren forbliver append-only.
disable-model-invocation: true
argument-hint: <kort-navn-med-underscore>
---

Opret en ny migration med navnet `$ARGUMENTS`.

1. Find det højeste nummer i `prisma/migrations/` (mapper som `0020_password_reset`). Den nye mappe hedder næste nummer med fire cifre plus navnet, fx `0021_$ARGUMENTS`.
2. Ret `prisma/schema.prisma`.
3. Generér SQL'en uden at køre den:
   - Med en database (`DATABASE_URL` sat): `npx prisma migrate dev --create-only --name $ARGUMENTS`, og omdøb mappen, hvis Prisma har givet den et tidsstempel i stedet for nummeret.
   - Uden database: skriv SQL'en i hånden i `prisma/migrations/<mappe>/migration.sql` ud fra ændringen i skemaet, i samme stil som de tidligere migrationer.
4. Læs den genererede SQL og afvis den, hvis den:
   - laver `UPDATE`, `DELETE` eller `TRUNCATE` på `"Prediction"`,
   - dropper eller ændrer triggerne og funktionerne fra `0002_ledger_immutability` (`prediction_no_update`, `prediction_no_delete`, `prediction_no_truncate`, `oddsiq_check_prediction_chain`),
   - dropper kolonner på `"Prediction"`. Udfald hører til i `"PredictionOutcome"`.
5. `migration.sql` står i `.gitignore`, så tilføj filen med `git add -f prisma/migrations/<mappe>/migration.sql`.
6. Kør `npm run typecheck && npm test`. CI-jobbet `ledger-db` kører migrationerne mod Postgres og tjekker, at ledgeren afviser UPDATE og DELETE.

Ret aldrig en migration, der allerede findes. En hook blokerer det; lav en ny i stedet.
