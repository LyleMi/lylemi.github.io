---
layout: post
title:  "php unserialize()/wakeup()漏洞"
date:   2016-10-29 09:31:40 +0800
categories: web
---
unserialize和serialize这里不做赘述。

unserialize的漏洞在magic function上，如果一个类定义了\_\_wakup()和\_\_destruct()，则该类的实例被反序列化时，会自动调用\_\_wakeup(), 生命周期结束时，则调用\_\_desturct()。


下面提供一个简单的demo.

```php
class Demo
{

    public $data;

    public function __construct($data)
    {
        $this->data = $data;
        echo "construct<br />";
    }

    public function __wakeup()
    {
        echo "wake up<br />";
    }

    public function __destruct()
    {
        echo "Data's value is $this->data. <br />";
        echo "destruct<br />";
    }
}

var_dump(serialize(new Demo("raw value")));

```

输出

````php
construct
Data's value is raw value.
destruct
string(44) "O:4:"Demo":1:{s:4:"data";s:9:"raw value";}" 
```

把序列化的字符串修改一下后，执行

```php
unserialize('O:4:"Demo":1:{s:4:"data";s:15:"malicious value";}');
```

输出

```
wake up
Data's value is malicious value.
destruct
```

这里看到，值被修改了.

上面是一个unserialize()的简单应用，不难看出，如果\_\_wakeup()或者 \_\_desturct()有敏感操作，比如读写文件、操作数据库，就可以通过函数实现文件读写或者数据读取的行为。

那么，在\_\_wakeup()中加入判断是否可以阻止这个漏洞呢？
在\_\_wakeup()中我们加入一行代码

```php
    public function __wakeup()
    {
        if($this->data != 'raw value') $this->data = 'raw value';
        echo "wake up<br />";
    }
```

但其实还是可以绕过的，在 PHP5 < 5.6.25， PHP7 < 7.0.10 的版本都存在wakeup的漏洞。当反序列化中object的个数和之前的个数不等时，wakeup就会被绕过，于是使用下面的payload

```php
unserialize('O:7:"HITCON":1:{s:4:"data";s:15:"malicious value";}');
```

输出

```
Data's value is malicious value.
destruct
```

这里wakeup被绕过，值依旧被修改了。
