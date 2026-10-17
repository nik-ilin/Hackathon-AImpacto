import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";
import ts from "typescript";
import { localConfig } from "./local-config.mjs";

const args = process.argv.slice(2);
if (args.length && (args.length !== 2 || args[0] !== "--generated-file")) {
  throw new Error("Uso: node tests/integration/check-generated-types.mjs [--generated-file <database.ts>]");
}
let generatedFile;
if (args.length) {
  generatedFile = resolve(args[1]); // Offline: only read the supplied official artifact.
} else {
  localConfig(); // loopback-only; never query the hosted project.
  const directory = ".local/generated";
  mkdirSync(directory, { recursive: true });
  const generated = execFileSync(process.execPath, ["node_modules/supabase/dist/supabase.js", "gen", "types", "typescript", "--local"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  generatedFile = resolve(directory, "database.ts");
  writeFileSync(generatedFile, generated);
}
if (!readFileSync(generatedFile, "utf8").includes("export type Database")) {
  throw new Error("La CLI o el artefacto no contiene el contrato Database esperado.");
}
const directory = mkdtempSync(join(tmpdir(), "nexolab-types-"));
const contractFile = join(directory, "contract.ts");
const importPath = (file) => {
  const value = relative(directory, file).replaceAll("\\", "/");
  if (isAbsolute(value)) return value; // Different Windows drive from the temp directory.
  return value.startsWith(".") ? value : `./${value}`;
};
const expectedImport = importPath(resolve("src/types/database.ts"));
const generatedImport = importPath(generatedFile);
try {
  writeFileSync(contractFile, `
import type { Database as Expected, Json as ExpectedJson } from ${JSON.stringify(expectedImport)};
import type { Database as Actual } from ${JSON.stringify(generatedImport)};
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

// Diagnostic aliases do not participate in or weaken the assertions above.
type ExpectedRows = { [K in keyof ET]: Normalize<ET[K]['Row']> };
type GeneratedRows = { [K in keyof AT]: Normalize<AT[K]['Row']> };
type ExpectedArgs = { [K in keyof EF]: ArgTypes<EF[K]['Args']> };
type GeneratedArgs = { [K in keyof AF]: ArgTypes<AF[K]['Args']> };
type ExpectedReturns = { [K in keyof EF]: Normalize<EF[K]['Returns']> };
type GeneratedReturns = { [K in keyof AF]: Normalize<AF[K]['Returns']> };
`);
  const program = ts.createProgram([contractFile], {
    noEmit: true, strict: true, skipLibCheck: true,
    module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler,
  });
  const diagnostics = ts.getPreEmitDiagnostics(program);
  if (diagnostics.length) {
    const checker = program.getTypeChecker();
    const source = program.getSourceFile(contractFile);
    const aliases = new Map(source.statements.filter(ts.isTypeAliasDeclaration)
      .map((node) => [node.name.text, checker.getTypeFromTypeNode(node.type)]));
    const property = (type, name) => {
      const symbol = type && checker.getPropertyOfType(type, name);
      return symbol && checker.getTypeOfSymbolAtLocation(symbol, source);
    };
    const display = (type) => type ? checker.typeToString(type, source,
      ts.TypeFormatFlags.NoTruncation | ts.TypeFormatFlags.UseAliasDefinedOutsideCurrentScope) : "<missing>";
    const report = (path, expected, generated) => {
      process.stderr.write(`${path}: expected ${display(expected)}; generated ${display(generated)}\n`);
    };
    const differs = (a, b) => !a || !b || !checker.isTypeAssignableTo(a, b) || !checker.isTypeAssignableTo(b, a);
    const compare = (path, a, b, rawA = a, rawB = b) => {
      if (!differs(a, b)) return;
      // Only descend into plain records or arrays. Json/scalar/nullability differences
      // remain leaf diagnostics, avoiding recursive Json expansion.
      if (a && b && checker.isArrayType(a) && checker.isArrayType(b)) {
        compare(`${path}[]`, checker.getIndexTypeOfType(a, ts.IndexKind.Number), checker.getIndexTypeOfType(b, ts.IndexKind.Number),
          checker.getIndexTypeOfType(rawA, ts.IndexKind.Number), checker.getIndexTypeOfType(rawB, ts.IndexKind.Number));
      } else if (a && b && (a.flags & ts.TypeFlags.Object) && (b.flags & ts.TypeFlags.Object)
        && !a.getStringIndexType() && !b.getStringIndexType()) {
        const names = new Set([...a.getProperties(), ...b.getProperties()].map((symbol) => symbol.name));
        for (const name of names) {
          const left = property(a, name), right = property(b, name);
          const leftSymbol = checker.getPropertyOfType(a, name), rightSymbol = checker.getPropertyOfType(b, name);
          if (leftSymbol && rightSymbol && (leftSymbol.flags & ts.SymbolFlags.Optional) !== (rightSymbol.flags & ts.SymbolFlags.Optional)) {
            process.stderr.write(`${path}.${name}: expected ${leftSymbol.flags & ts.SymbolFlags.Optional ? "optional" : "required"}; generated ${rightSymbol.flags & ts.SymbolFlags.Optional ? "optional" : "required"}\n`);
          }
          compare(`${path}.${name}`, left, right, property(rawA, name), property(rawB, name));
        }
      } else report(path, rawA, rawB);
    };
    // Render each row separately with its raw Row types (the aliases above are normalized).
    for (const name of new Set([...aliases.get("ET").getProperties(), ...aliases.get("AT").getProperties()].map((symbol) => symbol.name))) {
      compare(`Tables.${name}.Row`, property(aliases.get("ExpectedRows"), name), property(aliases.get("GeneratedRows"), name),
        property(property(aliases.get("ET"), name), "Row"), property(property(aliases.get("AT"), name), "Row"));
    }
    for (const name of aliases.get("EF").getProperties().map((symbol) => symbol.name)) {
      compare(`Functions.${name}.Args`, property(aliases.get("ExpectedArgs"), name), property(aliases.get("GeneratedArgs"), name),
        property(property(aliases.get("EF"), name), "Args"), property(property(aliases.get("AF"), name), "Args"));
      compare(`Functions.${name}.Returns`, property(aliases.get("ExpectedReturns"), name), property(aliases.get("GeneratedReturns"), name),
        property(property(aliases.get("EF"), name), "Returns"), property(property(aliases.get("AF"), name), "Returns"));
    }
    process.stderr.write(ts.formatDiagnostics(diagnostics, {
      getCanonicalFileName: (file) => file, getCurrentDirectory: () => process.cwd(), getNewLine: () => "\n",
    }));
    process.exitCode = 1;
  } else {
    process.stdout.write("Tipos oficiales generados: tablas, tipos/columnas/nullability y argumentos/retornos RPC coherentes.\n");
  }
} finally {
  rmSync(directory, { recursive: true, force: true });
}
