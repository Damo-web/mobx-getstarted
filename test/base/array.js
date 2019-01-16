"use strict"

var mobx = require("../../src/mobx.ts")
const { observable, $mobx, when, _getAdministration } = mobx
var iterall = require("iterall")

function buffer() {
    var b = []
    var res = function(newValue) {
        b.push(newValue)
    }
    res.toArray = function() {
        return b
    }
    return res
}

test("test1", function() {
    var a = observable.array([])
    expect(a.length).toBe(0)
    expect(Object.keys(a)).toEqual([])
    expect(a.slice()).toEqual([])

    a.push(1)
    expect(a.length).toBe(1)
    expect(a.slice()).toEqual([1])

    a[1] = 2
    expect(a.length).toBe(2)
    expect(a.slice()).toEqual([1, 2])

    var sum = mobx.computed(function() {
        return (
            -1 +
            a.reduce(function(a, b) {
                return a + b
            }, 1)
        )
    })

    expect(sum.get()).toBe(3)

    a[1] = 3
    expect(a.length).toBe(2)
    expect(a.slice()).toEqual([1, 3])
    expect(sum.get()).toBe(4)

    a.splice(1, 1, 4, 5)
    expect(a.length).toBe(3)
    expect(a.slice()).toEqual([1, 4, 5])
    expect(sum.get()).toBe(10)

    a.replace([2, 4])
    expect(sum.get()).toBe(6)

    a.splice(1, 1)
    expect(sum.get()).toBe(2)
    expect(a.slice()).toEqual([2])

    a.spliceWithArray(0, 0, [4, 3])
    expect(sum.get()).toBe(9)
    expect(a.slice()).toEqual([4, 3, 2])

    a.clear()
    expect(sum.get()).toBe(0)
    expect(a.slice()).toEqual([])

    a.length = 4
    expect(isNaN(sum.get())).toBe(true)
    expect(a.length).toEqual(4)

    expect(a.slice()).toEqual([undefined, undefined, undefined, undefined])

    a.replace([1, 2, 2, 4])
    expect(sum.get()).toBe(9)
    a.length = 4
    expect(sum.get()).toBe(9)

    a.length = 2
    expect(sum.get()).toBe(3)
    expect(a.slice()).toEqual([1, 2])

    expect(a.slice().reverse()).toEqual([2, 1])
    expect(a.slice()).toEqual([1, 2])

    a.unshift(3)
    expect(a.slice().sort()).toEqual([1, 2, 3])
    expect(a.slice()).toEqual([3, 1, 2])

    expect(JSON.stringify(a)).toBe("[3,1,2]")

    expect(a.get(1)).toBe(1)
    a.set(2, 4)
    expect(a.get(2)).toBe(4)

    expect(Object.keys(a)).toEqual(["0", "1", "2"]) // ideally....
})

test("array should support iterall / iterable ", () => {
    var a = observable([1, 2, 3])

    expect(iterall.isIterable(a)).toBe(true)
    expect(iterall.isArrayLike(a)).toBe(true)

    var values = []
    iterall.forEach(a, v => values.push(v))

    expect(values).toEqual([1, 2, 3])

    var iter = iterall.getIterator(a)
    expect(iter.next()).toEqual({ value: 1, done: false })
    expect(iter.next()).toEqual({ value: 2, done: false })
    expect(iter.next()).toEqual({ value: 3, done: false })
    expect(iter.next()).toEqual({ value: undefined, done: true })

    a.replace([])
    iter = iterall.getIterator(a)
    expect(iter.next()).toEqual({ value: undefined, done: true })
})

test("find(findIndex) and remove", function() {
    var a = mobx.observable([10, 20, 20])
    var idx = -1
    function predicate(item, index) {
        if (item === 20) {
            idx = index
            return true
        }
        return false
    }
    ;[].findIndex
    expect(a.find(predicate)).toBe(20)
    expect(a.findIndex(predicate)).toBe(1)
    expect(a.find(predicate)).toBe(20)

    expect(a.remove(20)).toBe(true)
    expect(a.find(predicate)).toBe(20)
    expect(idx).toBe(1)
    expect(a.findIndex(predicate)).toBe(1)
    idx = -1
    expect(a.remove(20)).toBe(true)
    expect(a.find(predicate)).toBe(undefined)
    expect(idx).toBe(-1)
    expect(a.findIndex(predicate)).toBe(-1)

    expect(a.remove(20)).toBe(false)
})

test("concat should automatically slice observable arrays, #260", () => {
    var a1 = mobx.observable([1, 2])
    var a2 = mobx.observable([3, 4])
    expect(a1.concat(a2)).toEqual([1, 2, 3, 4])
})

test("observe", function() {
    var ar = mobx.observable([1, 4])
    var buf = []
    var disposer = ar.observe(function(changes) {
        buf.push(changes)
    }, true)

    ar[1] = 3 // 1,3
    ar[2] = 0 // 1, 3, 0
    ar.shift() // 3, 0
    ar.push(1, 2) // 3, 0, 1, 2
    ar.splice(1, 2, 3, 4) // 3, 3, 4, 2
    expect(ar.slice()).toEqual([3, 3, 4, 2])
    ar.splice(6)
    ar.splice(6, 2)
    ar.replace(["a"])
    ar.pop()
    ar.pop() // does not fire anything

    // check the object param
    buf.forEach(function(change) {
        expect(change.object).toBe(ar)
        delete change.object
    })

    var result = [
        { type: "splice", index: 0, addedCount: 2, removed: [], added: [1, 4], removedCount: 0 },
        { type: "update", index: 1, oldValue: 4, newValue: 3 },
        { type: "splice", index: 2, addedCount: 1, removed: [], added: [0], removedCount: 0 },
        { type: "splice", index: 0, addedCount: 0, removed: [1], added: [], removedCount: 1 },
        { type: "splice", index: 2, addedCount: 2, removed: [], added: [1, 2], removedCount: 0 },
        {
            type: "splice",
            index: 1,
            addedCount: 2,
            removed: [0, 1],
            added: [3, 4],
            removedCount: 2
        },
        {
            type: "splice",
            index: 0,
            addedCount: 1,
            removed: [3, 3, 4, 2],
            added: ["a"],
            removedCount: 4
        },
        { type: "splice", index: 0, addedCount: 0, removed: ["a"], added: [], removedCount: 1 }
    ]

    expect(buf).toEqual(result)

    disposer()
    ar[0] = 5
    expect(buf).toEqual(result)
})

test("array modification1", function() {
    var a = mobx.observable([1, 2, 3])
    var r = a.splice(-10, 5, 4, 5, 6)
    expect(a.slice()).toEqual([4, 5, 6])
    expect(r).toEqual([1, 2, 3])
})

test("serialize", function() {
    var a = [1, 2, 3]
    var m = mobx.observable(a)

    expect(JSON.stringify(m)).toEqual(JSON.stringify(a))

    expect(a).toEqual(m.slice())

    a = [4]
    m.replace(a)
    expect(JSON.stringify(m)).toEqual(JSON.stringify(a))
    expect(a).toEqual(m.toJSON())
})

test("array modification functions", function() {
    var ars = [[], [1, 2, 3]]
    var funcs = ["push", "pop", "shift", "unshift"]
    funcs.forEach(function(f) {
        ars.forEach(function(ar) {
            var a = ar.slice()
            var b = mobx.observable(a)
            var res1 = a[f](4)
            var res2 = b[f](4)
            expect(res1).toEqual(res2)
            expect(a).toEqual(b.slice())
        })
    })
})

test("array modifications", function() {
    var a2 = mobx.observable([])
    var inputs = [undefined, -10, -4, -3, -1, 0, 1, 3, 4, 10]
    var arrays = [
        [],
        [1],
        [1, 2, 3, 4],
        [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
        [1, undefined],
        [undefined]
    ]
    for (var i = 0; i < inputs.length; i++)
        for (var j = 0; j < inputs.length; j++)
            for (var k = 0; k < arrays.length; k++)
                for (var l = 0; l < arrays.length; l++) {
                    var msg = [
                        "array mod: [",
                        arrays[k].toString(),
                        "] i: ",
                        inputs[i],
                        " d: ",
                        inputs[j],
                        " [",
                        arrays[l].toString(),
                        "]"
                    ].join(" ")
                    var a1 = arrays[k].slice()
                    a2.replace(a1)
                    var res1 = a1.splice.apply(a1, [inputs[i], inputs[j]].concat(arrays[l]))
                    var res2 = a2.splice.apply(a2, [inputs[i], inputs[j]].concat(arrays[l]))
                    expect(a1.slice()).toEqual(a2.slice())
                    expect(res1).toEqual(res2)
                    expect(a1.length).toBe(a2.length)
                }
})

test("is array", function() {
    var x = mobx.observable([])
    expect(x instanceof Array).toBe(true)

    // would be cool if this would return true...
    expect(Array.isArray(x)).toBe(true)
})

test("stringifies same as ecma array", function() {
    const x = mobx.observable([])
    expect(x instanceof Array).toBe(true)

    // would be cool if these two would return true...
    expect(x.toString()).toBe("")
    expect(x.toLocaleString()).toBe("")
    x.push(1, 2)
    expect(x.toString()).toBe("1,2")
    expect(x.toLocaleString()).toBe("1,2")
})

test("observes when stringified", function() {
    const x = mobx.observable([])
    let c = 0
    mobx.autorun(function() {
        x.toString()
        c++
    })
    x.push(1)
    expect(c).toBe(2)
})

test("observes when stringified to locale", function() {
    const x = mobx.observable([])
    let c = 0
    mobx.autorun(function() {
        x.toLocaleString()
        c++
    })
    x.push(1)
    expect(c).toBe(2)
})

test("react to sort changes", function() {
    var x = mobx.observable([4, 2, 3])
    var sortedX = mobx.computed(function() {
        return x.slice().sort()
    })
    var sorted

    mobx.autorun(function() {
        sorted = sortedX.get()
    })

    expect(x.slice()).toEqual([4, 2, 3])
    expect(sorted).toEqual([2, 3, 4])
    x.push(1)
    expect(x.slice()).toEqual([4, 2, 3, 1])
    expect(sorted).toEqual([1, 2, 3, 4])
    x.shift()
    expect(x.slice()).toEqual([2, 3, 1])
    expect(sorted).toEqual([1, 2, 3])
})

test("autoextend buffer length", function() {
    var ar = observable(new Array(1000))
    var changesCount = 0
    ar.observe(changes => ++changesCount)

    ar[ar.length] = 0
    ar.push(0)

    expect(changesCount).toBe(2)
})

test("array exposes correct keys", () => {
    var keys = []
    var ar = observable([1, 2])
    for (var key in ar) keys.push(key)

    expect(keys).toEqual(["0", "1"])
})

test("isArrayLike", () => {
    var arr = [0, 1, 2]
    var observableArr = observable(arr)

    var isArrayLike = mobx.isArrayLike
    expect(typeof isArrayLike).toBe("function")

    expect(isArrayLike(observableArr)).toBe(true)
    expect(isArrayLike(arr)).toBe(true)
    expect(isArrayLike(42)).toBe(false)
    expect(isArrayLike({})).toBe(false)
})

test("accessing out of bound values throws", () => {
    const a = mobx.observable([])

    var warns = 0
    const baseWarn = console.warn
    console.warn = () => {
        warns++
    }

    a[0] // out of bounds
    a[1] // out of bounds

    expect(warns).toBe(2)

    expect(() => (a[0] = 3)).not.toThrow()
    expect(() => (a[2] = 4)).toThrow(/Index out of bounds, 2 is larger than 1/)

    console.warn = baseWarn
})

test("replace can handle large arrays", () => {
    const a = mobx.observable([])
    const b = []
    b.length = 1000 * 1000
    expect(() => {
        a.replace(b)
    }).not.toThrow()

    expect(() => {
        a.spliceWithArray(0, 0, b)
    }).not.toThrow()
})

test("can iterate arrays", () => {
    const x = mobx.observable([])
    const y = []
    const d = mobx.reaction(() => Array.from(x), items => y.push(items), { fireImmediately: true })

    x.push("a")
    x.push("b")
    expect(y).toEqual([[], ["a"], ["a", "b"]])
    d()
})

test("array is concat spreadable, #1395", () => {
    const x = mobx.observable([1, 2, 3, 4])
    const y = [5].concat(x)
    expect(y.length).toBe(5)
    expect(y).toEqual([5, 1, 2, 3, 4])
})

test("array is spreadable, #1395", () => {
    const x = mobx.observable([1, 2, 3, 4])
    expect([5, ...x]).toEqual([5, 1, 2, 3, 4])

    const y = mobx.observable([])
    expect([5, ...y]).toEqual([5])
})

test("array supports toStringTag, #1490", () => {
    // N.B. on old environments this requires polyfils for these symbols *and* Object.prototype.toString.
    // core-js provides both
    const a = mobx.observable([])
    expect(Object.prototype.toString.call(a)).toBe("[object Array]")
})

test("slice works", () => {
    const a = mobx.observable([1, 2, 3])
    expect(a.slice(0, 2)).toEqual([1, 2])
})

test("slice is reactive", () => {
    const a = mobx.observable([1, 2, 3])
    let ok = false
    when(() => a.slice().length === 4, () => (ok = true))
    expect(ok).toBe(false)
    a.push(1)
    expect(ok).toBe(true)
})

test("toString", () => {
    expect(mobx.observable([1, 2]).toString()).toEqual([1, 2].toString())
    expect(mobx.observable([1, 2]).toLocaleString()).toEqual([1, 2].toLocaleString())
})

test("can define properties on arrays", () => {
    const ar = observable.array([1, 2])
    Object.defineProperty(ar, "toString", {
        enumerable: false,
        configurable: true,
        value: function() {
            return "hoi"
        }
    })

    expect(ar.toString()).toBe("hoi")
    expect("" + ar).toBe("hoi")
})

test("concats correctly #1667", () => {
    const x = observable({ data: [] })

    function generate(count) {
        const d = []
        for (let i = 0; i < count; i++) d.push({})
        return d
    }

    x.data = generate(10000)
    const first = x.data[0]
    expect(Array.isArray(x.data)).toBe(true)

    x.data = x.data.concat(generate(1000))
    expect(Array.isArray(x.data)).toBe(true)
    expect(x.data[0]).toBe(first)
    expect(x.data.length).toBe(11000)
})

test("dehances last value on shift/pop", () => {
    const x1 = observable([3, 5])
    _getAdministration(x1).dehancer = value => {
        return value * 2
    }
    expect(x1.shift()).toBe(6)
    expect(x1.shift()).toBe(10)

    const x2 = observable([3, 5])
    _getAdministration(x2).dehancer = value => {
        return value * 2
    }
    expect(x2.pop()).toBe(10)
    expect(x2.pop()).toBe(6)
})
