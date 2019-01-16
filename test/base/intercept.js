var m = require("../../src/mobx.ts")
var intercept = m.intercept

test("intercept observable value", () => {
    var a = m.observable.box(1)

    var d = intercept(a, () => {
        return null
    })

    a.set(2)

    expect(a.get()).toBe(1)

    d()

    a.set(3)
    expect(a.get()).toBe(3)

    d = intercept(a, c => {
        if (c.newValue % 2 === 0) {
            throw "value should be odd!"
        }
        return c
    })

    expect(() => {
        a.set(4)
    }).toThrow(/value should be odd/)

    expect(a.get()).toBe(3)
    a.set(5)
    expect(a.get()).toBe(5)

    d()
    d = intercept(a, c => {
        c.newValue *= 2
        return c
    })

    a.set(6)
    expect(a.get()).toBe(12)

    var d2 = intercept(a, c => {
        c.newValue += 1
        return c
    })

    a.set(7)
    expect(a.get()).toBe(15)

    d()
    a.set(8)
    expect(a.get()).toBe(9)
})

test("intercept array", () => {
    var a = m.observable([1, 2])

    var d = a.intercept(c => null)
    a.push(2)
    expect(a.slice()).toEqual([1, 2])

    d()

    d = intercept(a, c => {
        if (c.type === "splice") {
            c.added.push(c.added[0] * 2)
            c.removedCount = 1
            return c
        } else if (c.type === "update") {
            c.newValue = c.newValue * 3
            return c
        }
    })

    a.unshift(3, 4)

    expect(a.slice()).toEqual([3, 4, 6, 2])
    a[2] = 5
    expect(a.slice()).toEqual([3, 4, 15, 2])
})

test("intercept object", () => {
    var a = m.observable({
        b: 3
    })

    var d = intercept(a, change => {
        change.newValue *= 3
        return change
    })

    a.b = 4

    expect(a.b).toBe(12)

    var d2 = intercept(a, "b", change => {
        change.newValue += 1
        return change
    })

    a.b = 5
    expect(a.b).toBe(16)

    var d3 = intercept(a, c => {
        expect(c.name).toBe("b")
        expect(c.object).toBe(a)
        expect(c.type).toBe("update")
        return null
    })

    a.b = 7
    expect(a.b).toBe(16)

    d3()
    a.b = 7
    expect(a.b).toBe(22)
})

test("intercept property additions", () => {
    var a = m.observable({})
    var d4 = intercept(a, change => {
        if (change.type === "add") {
            return null
        }
        return change
    })

    m.extendObservable(a, { c: 1 }) // not added!
    expect(a.c).toBe(undefined)
    expect(m.isObservableProp(a, "c")).toBe(false)

    d4()

    m.extendObservable(a, { c: 2 })
    expect(a.c).toBe(2)
    expect(m.isObservableProp(a, "c")).toBe(true)
})

test("intercept map", () => {
    var a = m.observable.map({
        b: 3
    })

    var d = intercept(a, c => {
        c.newValue *= 3
        return c
    })

    a.set("b", 4)

    expect(a.get("b")).toBe(12)

    var d2 = intercept(a, "b", c => {
        c.newValue += 1
        return c
    })

    a.set("b", 5)
    expect(a.get("b")).toBe(16)

    var d3 = intercept(a, c => {
        expect(c.name).toBe("b"), expect(c.object).toBe(a)
        expect(c.type).toBe("update")
        return null
    })

    a.set("b", 7)
    expect(a.get("b")).toBe(16)

    d3()
    a.set("b", 7)
    expect(a.get("b")).toBe(22)

    var d4 = intercept(a, c => {
        if (c.type === "delete") return null
        return c
    })

    a.delete("b")
    expect(a.has("b")).toBe(true)
    expect(a.get("b")).toBe(22)

    d4()
    a.delete("b")
    expect(a.has("b")).toBe(false)
    expect(a.get("c")).toBe(undefined)
})
