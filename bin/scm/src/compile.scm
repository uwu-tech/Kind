(optimize-level 2)
(generate-wpo-files #t)
(compile-imported-libraries #t)
(compile-program "main.scm")
(compile-whole-program "./main.wpo" "./../bin/kind-scm")
(exit)
