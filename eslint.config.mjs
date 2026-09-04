// ===================================================================
// Lint configuration, tuned against LLM-authored code.
//
// This file carries roughly two thirds of the enforcement. No tsconfig
// flag can ban `any`, `as`, `!`, or any suppression comment, so a strict
// tsconfig without this file is a strict setup with every escape hatch
// wide open.
//
// THE DESIGN DECISION THAT DIFFERS FROM AN ORDINARY STRICT SETUP
//
// There is no suppression mechanism anywhere. `@ts-expect-error` is
// banned along with `@ts-ignore`, and `noInlineConfig` disables every
// `eslint-disable` comment.
//
// The usual argument for keeping one marked hatch is that a config with
// no release valve produces contorted code, and contortions review worse
// than a marked exception. That rests on an author who feels friction
// writing a justification. A language model does not. Producing a
// plausible rationale is the cheapest thing it can do, which makes a
// justification-gated hatch the highest-throughput evasion available.
//
// If your authors are human, reconsider this specific choice. For
// generated code it is the point.
//
// Most rules here need type information, so the parser gets the project
// service. That requires a tsconfig.json covering the same files as the
// `files` array below. Keep the two in sync.
// ===================================================================
// defineConfig comes from ESLint core. typescript-eslint's own
// tseslint.config() helper is deprecated as of v8.69 and is caught by
// this config's own no-deprecated rule, so using it would ship a config
// that fails its own rules.
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig(
  {
    // tools/probe is excluded because probe.mts is DESIGNED to fail. It is
    // copied to the project root by CI, linted there so this config
    // applies, then removed. Leaving it in the normal tree makes the build
    // permanently red.
    //
    // Add your own entries only with a reason you would defend: anything
    // ignored here is unlinted, and unlinted is where an agent that cannot
    // satisfy the rules will put the file.
    ignores: ["**/node_modules/**", "**/dist/**", "tools/probe/**"],
  },

  {
    // A lint rule that any comment can switch off is a suggestion. The one
    // remaining opt-out in the whole setup is `@ts-expect-error`, which is
    // greppable, needs a written reason, and fails once it stops being
    // needed. It is the `unsafe` block of this configuration.
    linterOptions: {
      noInlineConfig: true,
      reportUnusedDisableDirectives: "error",
    },
  },

  {
    // Every extension the runtime will actually execute, not just the
    // ones you expect to see. A .mjs file was found by probe to be
    // entirely unlinted when this list named four extensions instead of
    // six. The structural escapes matter more in practice than the
    // exotic-syntax ones: the cheapest evasion is not clever syntax, it
    // is putting the file where the tools do not look.
    files: [
      "**/*.mts",
      "**/*.cts",
      "**/*.ts",
      "**/*.d.ts",
      "**/*.js",
      "**/*.mjs",
      "**/*.cjs",
    ],

    extends: [
      ...tseslint.configs.strictTypeChecked,
      ...tseslint.configs.stylisticTypeChecked,
    ],

    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },

    rules: {
      // ---- The escape hatches ------------------------------------------
      // `any` disables the checker wherever it lands and spreads through
      // assignment. `unknown` is the honest spelling of an unconstrained
      // value and forces a narrowing step before use.
      "@typescript-eslint/no-explicit-any": [
        "error",
        { fixToUnknown: false, ignoreRestArgs: false },
      ],

      // A type assertion is an unchecked claim about a value, nearer to
      // transmute than to a cast. Narrowing must go through a predicate or
      // a check the compiler can follow. `as const` is unaffected.
      "@typescript-eslint/consistent-type-assertions": [
        "error",
        { assertionStyle: "never" },
      ],
      "@typescript-eslint/no-unsafe-type-assertion": "error",
      "@typescript-eslint/no-non-null-assertion": "error",

      // A user-defined type predicate `x is T` and an assertion signature
      // `asserts x is T` are unchecked claims with exactly the power of the
      // `as` banned above. The compiler verifies that the function returns a
      // boolean, never that the boolean means what it says. Narrowing goes
      // through checks the compiler can follow on its own.
      "no-restricted-syntax": [
        "error",
        {
          selector: "TSDeclareFunction",
          message:
            "An overload signature or ambient function declaration is not checked against its implementation. Write one implementation signature.",
        },
        {
          // AUDIT FINDING. TSDeclareFunction covers top-level overloads
          // only. A class method overload is a MethodDefinition whose
          // value has no body, so without this selector the same hatch
          // stays wide open inside every class. Verified: the selector
          // catches the overload signature and leaves ordinary methods
          // alone.
          selector: "TSEmptyBodyFunctionExpression",
          message:
            "A class method overload signature is not checked against its implementation. Write one implementation signature.",
        },
        {
          selector: "VariableDeclaration[declare=true]",
          message:
            "An ambient declaration asserts a type for a value the checker never sees. Import the value instead.",
        },
        {
          selector: "TSModuleDeclaration[declare=true]",
          message:
            "An ambient module declaration fabricates types for code the checker never sees.",
        },
        {
          selector: "TSTypePredicate",
          message:
            "Type predicates and assertion signatures are unchecked narrowing. Use a check the compiler can follow, or a validator that returns a discriminated union.",
        },
      ],

      // `object` and `Function` are the structural equivalents of `any` for
      // their respective kinds.
      "@typescript-eslint/no-restricted-types": [
        "error",
        {
          types: {
            object: "Use a concrete shape, Record<string, unknown>, or unknown.",
            Function: "Use a specific call signature.",
            "{}": "Use a concrete shape, object, or unknown.",
          },
        },
      ],

      // Suppression comments are unchecked claims with no type at all.
      // `@ts-expect-error` survives because it fails when the error it
      // claims to suppress goes away, so it cannot rot silently.
      "@typescript-eslint/ban-ts-comment": [
        "error",
        {
          "ts-expect-error": true,
          "ts-ignore": true,
          "ts-nocheck": true,
          "ts-check": false,
        },
      ],

      // ---- Boundaries ---------------------------------------------------
      // Inference inside a function body is fine. A signature is a contract
      // and gets written out.
      "@typescript-eslint/explicit-function-return-type": [
        "error",
        { allowExpressions: false, allowTypedFunctionExpressions: true },
      ],
      "@typescript-eslint/explicit-module-boundary-types": "error",

      // LIMITATION: `${String(x)}` satisfies restrict-template-expressions
      // while defeating its purpose, and draws no finding. Banning String
      // outright would break legitimate use, so this stays open by
      // choice. It needs review attention, not a rule.
      //
      // LIMITATION: `xs.filter(Boolean)` is not caught either, because
      // strict-boolean-expressions inspects conditions syntactically and
      // does not see a bare function reference.

      // ---- Coercion -----------------------------------------------------
      // No truthiness. A condition must already be boolean, so the empty
      // string, zero, and NaN cannot quietly take the false branch.
      "@typescript-eslint/strict-boolean-expressions": [
        "error",
        {
          allowString: false,
          allowNumber: false,
          allowNullableObject: false,
          allowNullableBoolean: false,
          allowNullableString: false,
          allowNullableNumber: false,
          allowAny: false,
        },
      ],
      eqeqeq: ["error", "always"],
      "@typescript-eslint/restrict-template-expressions": [
        "error",
        {
          allowNumber: false,
          allowBoolean: false,
          allowAny: false,
          allowNullish: false,
          allowRegExp: false,
          allowNever: false,
        },
      ],

      // ---- Exhaustiveness -----------------------------------------------
      // A switch over a union covers every variant or says so explicitly.
      "@typescript-eslint/switch-exhaustiveness-check": [
        "error",
        {
          allowDefaultCaseForExhaustiveSwitch: false,
          requireDefaultForNonUnion: true,
        },
      ],

      // ---- Variance -----------------------------------------------------
      // LIMITATION: this addresses bivariant method parameters only.
      // TypeScript arrays remain covariant, which is unsound, and no
      // rule or flag fixes that. `const cb: () => void = (): number => 42`
      // is likewise accepted by design so that forEach callbacks compile.
      // Method shorthand is checked bivariantly and is unsound. Property
      // syntax gets ordinary contravariant parameter checking.
      "@typescript-eslint/method-signature-style": ["error", "property"],

      // ---- Mutability ---------------------------------------------------
      "@typescript-eslint/prefer-readonly": "error",
      // Parameters are borrowed, not owned. A function that does not declare
      // intent to mutate does not get to mutate.
      "@typescript-eslint/prefer-readonly-parameter-types": "error",
      // The default sort is lexicographic, so [10, 9] sorts to [10, 9].
      "@typescript-eslint/require-array-sort-compare": "error",
      "prefer-const": "error",
      "no-var": "error",

      // ---- Asynchrony ---------------------------------------------------
      "@typescript-eslint/promise-function-async": "error",
      "@typescript-eslint/no-misused-promises": [
        "error",
        { checksVoidReturn: true, checksConditionals: true, checksSpreads: true },
      ],

      // ---- Modules ------------------------------------------------------
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "inline-type-imports" },
      ],

      // ---- Dynamic evaluation -------------------------------------------
      "no-eval": "error",
      "no-implied-eval": "error",
      "no-new-func": "error",

      // ---- Shadowing ----------------------------------------------------
      "no-shadow": "off",
      "@typescript-eslint/no-shadow": "error",

      // ---- Unused bindings ----------------------------------------------
      // The underscore prefix is the sole remaining opt-out anywhere in this
      // configuration, and it is scoped as narrowly as the rule allows: a
      // binding that has to exist to satisfy a signature but is never read.
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],

      "no-console": "off",
    },
  },

  // Declaration files are ambient by definition, so the ambient-declaration
  // selectors do not apply. The `any` ban and the narrowing ban still do.
  {
    files: ["**/*.d.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "TSTypePredicate",
          message:
            "Type predicates and assertion signatures are unchecked narrowing.",
        },
      ],
    },
  },

  // PROJECT-SPECIFIC. Legacy sources that predate the configuration.
  //
  // Note that this names individual files rather than using a `**/*.js`
  // glob. That was a real hole found by probe: a glob-based exemption
  // applies to NEW .js files too, so an agent can dodge every signature
  // rule simply by choosing the .js extension. Naming the files means the
  // exemption cannot grow on its own, and it shrinks to nothing as you
  // migrate.
  // DELETE THIS BLOCK if you have no legacy JavaScript. It is a hole by
  // construction and exists only to make adoption possible mid-migration.
  //
  // Replace the placeholder names with your actual legacy files. Do NOT
  // substitute a "**/*.js" glob, for the reason above.
  //
  // {
  //   files: [
  //     "legacy-entry.js",
  //     "legacy-helper.js",
  //   ],
  //   rules: {
  //     "@typescript-eslint/no-require-imports": "off",
  //     "@typescript-eslint/explicit-function-return-type": "off",
  //     "@typescript-eslint/explicit-module-boundary-types": "off",
  //   },
  // },
);
