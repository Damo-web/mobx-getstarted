# MobX

_Simple, scalable state management_

## 目录结构

- api/ :  存放模块暴露的绝大多数公共静态方法
- core/:     MobX 算法的应用; atoms, derivations, reactions, dependency trees, optimizations.
- types/ :  observable objects, arrays and values 所有包含的奇迹在这. 包括如 `asFlat`的修饰符.
- utils/ :  工具类.