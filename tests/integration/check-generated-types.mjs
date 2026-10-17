import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { localConfig } from "./local-config.mjs";
localConfig(); // loopback-only; never query the hosted project.
const directory = ".local/generated";
mkdirSync(directory, { recursive: true });
const generated = execFileSync(process.execPath, ["node_modules/supabase/dist/supabase.js", "gen", "types", "typescript", "--local"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
if (!generated.includes("export type Database")) throw new Error("La CLI no generó el contrato Database esperado.");
writeFileSync(`${directory}/database.ts`, generated);
writeFileSync(`${directory}/contract.ts`, `
import type { Database as Expected, Json as ExpectedJson } from '../../src/types/database';
import type { Database as Actual } from './database';
type Equal<A,B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
type Assert<T extends true> = T;
// Literal unions come from CHECK constraints in our curated contract; the official
// generator reports their PostgreSQL primitive. Json must short-circuit recursion.
type Normalize<T> = Equal<T,ExpectedJson> extends true ? 'json' : T extends string ? string : T extends number ? number : T extends boolean ? boolean : T extends null | undefined ? T : T extends Array<infer E> ? Normalize<E>[] : T extends object ? { [K in keyof T]: Normalize<T[K]> } : T;
type ArgTypes<T> = { [K in keyof T]: Normalize<NonNullable<T[K]>> };
type RequiredKeys<T> = { [K in keyof T]-?: {} extends Pick<T,K> ? never : K }[keyof T];
type ET = Expected['public']['Tables'];
type AT = Actual['public']['Tables'];
type EF = Expected['public']['Functions'];
type AF = Actual['public']['Functions'];
type TablesPresent = Assert<Equal<keyof ET, keyof AT>>;
type RowChecks = { [K in keyof ET]: K extends keyof AT ? Equal<Normalize<ET[K]['Row']>, Normalize<AT[K]['Row']>> : false };
type RowsMatch = Assert<Equal<RowChecks[keyof RowChecks], true>>;
type FunctionChecks = { [K in keyof EF]: K extends keyof AF ? Equal<keyof EF[K]['Args'], keyof AF[K]['Args']> extends true ? Equal<RequiredKeys<EF[K]['Args']>, RequiredKeys<AF[K]['Args']>> : false : false };
type FunctionsMatch = Assert<Equal<FunctionChecks[keyof FunctionChecks], true>>;
// PostgreSQL does not annotate nullability of non-strict function arguments.
type InputChecks = { [K in keyof EF]: K extends keyof AF ? Equal<ArgTypes<EF[K]['Args']>,ArgTypes<AF[K]['Args']>> : false };
type InputsMatch = Assert<Equal<InputChecks[keyof InputChecks], true>>;
type ReturnChecks = { [K in keyof EF]: K extends keyof AF ? Equal<Normalize<EF[K]['Returns']>,Normalize<AF[K]['Returns']>> : false };
type ReturnsMatch = Assert<Equal<ReturnChecks[keyof ReturnChecks], true>>;
export type VerifiedContract = [TablesPresent,RowsMatch,FunctionsMatch,InputsMatch,ReturnsMatch];
`);
execFileSync(process.execPath, ["node_modules/typescript/bin/tsc", "--ignoreConfig", "--noEmit", "--strict", "--skipLibCheck", "--module", "esnext", "--moduleResolution", "bundler", `${directory}/contract.ts`], { stdio: "inherit" });
process.stdout.write("Tipos oficiales generados: tablas, tipos/columnas/nullability y argumentos/retornos RPC coherentes.\n");
