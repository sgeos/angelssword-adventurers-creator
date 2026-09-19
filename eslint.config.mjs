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
    // public/ is now build output (public/js/*.mjs, compiled from
    // src/browser) plus static assets. The sources are linted; linting their
    // emitted form would only report on the compiler's formatting.
    ignores: ["**/node_modules/**", "**/dist/**", "public/**", "tmp/**", "secret/**", "tools/probe/**"],
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
        projectService: {
          // This file is JavaScript and cannot join a project: the root
          // tsconfig dropped allowJs when the last .js source was converted,
          // and allowJs is mutually exclusive with isolatedDeclarations.
          // allowDefaultProject gives it inferred types so the type-aware
          // rules still apply here rather than silently not running.
          //
          // Keep this list to config files. Anything a build or a test
          // imports belongs in a real project, where its types are checked
          // against everything else rather than inferred in isolation.
          allowDefaultProject: ["eslint.config.mjs"],
        },
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
      // DISABLED after trying it. Not a concession to noise: the rule is
      // unsatisfiable in three separate places in this codebase, and in
      // each the mutation is the contract rather than a defect.
      //
      //   - Express handlers exist to mutate `res`.
      //   - Anything touching Buffer or ImageData: both are mutable by
      //     nature, and a readonly view of a pixel buffer is not a thing.
      //   - sharp's and node-fetch's own signatures take mutable types.
      //
      // Left here rather than deleted so the next person does not
      // rediscover it. Immutability is still enforced where it can be:
      // prefer-readonly on class fields, readonly array parameters where
      // the code owns the type, and prefer-const.
      "@typescript-eslint/prefer-readonly-parameter-types": "off",
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
  // Build scripts not yet converted. Named individually, never a
  // "**/*.js" glob, so a NEW .js file gets no relief from the rules and
  // this list can only shrink.
  // The core lives in its own project, which withholds BOTH the DOM lib and
  // the node types. That project is the layering rule made executable, and it
  // catches every platform facility that arrives as a global.
  //
  // It cannot catch three, because they are ECMAScript rather than platform:
  // `Math.random`, `Date.now` and `new Date`. Rust's `no_std` has no
  // equivalent hole, its clock and its generator living in `std`. So the ban
  // is here, and it is the only thing standing between the core and an ambient
  // source of non-determinism.
  //
  // The core does not go without time or randomness. It receives them, which
  // is the whole point: a capability the core needs becomes a parameter the
  // platform supplies, and a core that cannot reach the ambient one has no
  // way to quietly skip that step. The same reasoning makes the core testable,
  // since an injected clock can be driven and an ambient one cannot.
  {
    files: ["src/core/**/*.mts"],
    languageOptions: {
      parserOptions: {
        projectService: false,
        project: "./tsconfig.core.json",
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "no-restricted-properties": [
        "error",
        {
          object: "Math",
          property: "random",
          message:
            "The core does not draw randomness. Take a seed or a RandomSource from the caller; the platform owns the generator.",
        },
        {
          object: "Date",
          property: "now",
          message:
            "The core does not read the clock. Take the instant from the caller; the platform owns the clock.",
        },
      ],
      "no-restricted-globals": [
        "error",
        {
          name: "Date",
          message:
            "The core does not read the clock. Take the instant from the caller; the platform owns the clock.",
        },
      ],
    },
  },

  // Browser sources live in a second TypeScript project, which supplies
  // the DOM lib and withholds the node types. The project service resolves
  // against the root config alone, so these files name theirs explicitly.
  // Every rule still applies; only the type information differs.
  {
    files: ["src/browser/**/*.mts"],
    languageOptions: {
      parserOptions: {
        projectService: false,
        project: "./tsconfig.browser.json",
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  // Worker sources live in a third project. The WebWorker and DOM libs both
  // declare `self` and cannot be loaded together, so a worker cannot join the
  // browser project. This block must follow the one above, whose glob also
  // matches this file; the later entry wins. Every rule still applies here.
  {
    files: ["src/browser/gif-worker.mts", "src/browser/timer-worker.mts"],
    languageOptions: {
      parserOptions: {
        projectService: false,
        project: "./tsconfig.worker.json",
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  // Tests and the Playwright config live in a fourth project, which supplies
  // both the node types and the DOM lib — specs need DOM for the callbacks
  // they hand to page.evaluate. Without this they resolve against the root
  // config, which excludes test/, and the type-aware rules cannot run at all.
  {
    files: ["test/**/*.mts", "test/**/*.ts", "playwright.config.ts"],
    languageOptions: {
      parserOptions: {
        projectService: false,
        project: "./tsconfig.test.json",
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  // Tests are TypeScript now and belong to tsconfig.test.json, so they are
  // linted with full type information like everything else. A
  // disableTypeChecked block stood here while they were untyped CommonJS; it
  // went with the last of them, along with the note explaining why a glob
  // exemption was tolerable. No exemption, no need for the excuse.
  //
  // What remains is narrow. A test body is an expression run for its
  // assertions, and Playwright hands callbacks to page.evaluate whose return
  // types are inferred and then checked against the assertions made on them.
  // Annotating every one adds noise without adding a guarantee.
  // A mock that satisfies a Promise-returning interface has nothing to await:
  // promise-function-async demands the `async` keyword, and require-await then
  // objects to its absent `await`. The two rules cannot both be satisfied
  // here, so the weaker one yields — and only in this file, where faking async
  // is the entire point. Everywhere else an async function with no await is
  // still a missing await.
  {
    files: ["test/helpers/mock-fetch.mts"],
    rules: {
      "@typescript-eslint/require-await": "off",
    },
  },

  {
    files: ["test/**"],
    rules: {
      "@typescript-eslint/explicit-function-return-type": "off",
      "@typescript-eslint/explicit-module-boundary-types": "off",

      // node:test's describe/it return promises the runner owns; awaiting
      // them is not how the API is used. Exempting those calls by name keeps
      // the rule live everywhere else in a test — a forgotten `await` on a
      // page action or an assertion helper is still an error, which is the
      // failure this rule actually exists to catch. Disabling it wholesale
      // for test/ would hide exactly that.
      "@typescript-eslint/no-floating-promises": [
        "error",
        {
          allowForKnownSafeCalls: [
            {
              from: "package",
              package: "node:test",
              name: [
                "describe",
                "it",
                "test",
                "before",
                "after",
                "beforeEach",
                "afterEach",
              ],
            },
          ],
        },
      ],
    },
  },

  // The migration's phase-1 relief block stood here, exempting the untyped
  // CommonJS sources from the type-aware rules. Every one of them has been
  // converted, so it is gone. Reintroducing an exemption like it should take
  // the same argument it originally took.
);
