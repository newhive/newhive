// IE 8 compatibility

Array.prototype.map = map(f) {
    var ret = [];
    for(var i = 0; i < this.length; i++) ret.push(f(this[i]));
    return ret;
};

Array.prototype.reduce = function(f, left) {
    var i = 0;
    if(left === undefined) {
        left = this[0];
        i = 1;
    }
    for(; i < this.length; i++){ left = f(left, this[i]) }
    return left;
};
