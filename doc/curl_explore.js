define('Test', function(){
    return function(){
        console.log('constructing Test');
        this.common = 'bang';
    };
});

define('Test2', ['Test'], function(Test){
    function Test2(){
        console.log('constructing Test');
    }
    Test2.prototype = new Test();

    return Test2;
});

curl('Test', function(T){ window.o = new T() });
curl('Test2', function(T){ window.o2 = new T() });
curl('Test2', function(T){ console.log(T instanceof Test2) }); // as expected

// curl('curl/undefine', function(uncurl){ uncurl('Test') })