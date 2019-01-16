"use strict"
const child_process = require("child_process")

function testOutput(cmd, expected) {
    it("Global state sharing: " + cmd, done => {
        const output = child_process.exec(
            "node -e '" + cmd + "'",
            { cwd: __dirname },
            (e, stdout, stderr) => {
                if (e) {
                    if (!expected) done.fail(e)
                    else {
                        expect("" + e).toContain(expected)
                        done()
                    }
                } else {
                    expect(stdout.toString()).toBe("")
                    expect(stderr.toString()).toBe(expected)
                    done()
                }
            }
        )
    })
}

describe("it should handle multiple instances with the correct warnings", () => {
    testOutput(
        'require("../../");global.__mobxGlobals.version = -1; require("../../lib/mobx.umd.js")',
        "There are multiple, different versions of MobX active. Make sure MobX is loaded only once"
    )
    testOutput(
        'const m = require("../../"); global.__mobxGlobals.version = -1; m.configure({isolateGlobalState: true});require("../../lib/mobx.umd.js").configure({isolateGlobalState: true})',
        ""
    )
    // testOutput(
    //     'require("../../");global.__mobxGlobals.version = -1;require("../../lib/mobx.umd.js").configure({isolateGlobalState: true})',
    //     ""
    // )
    testOutput(
        'const m = require("../../");global.__mobxGlobals.version = -1;m.configure({isolateGlobalState: true});require("../../lib/mobx.umd.js")',
        ""
    )
})
