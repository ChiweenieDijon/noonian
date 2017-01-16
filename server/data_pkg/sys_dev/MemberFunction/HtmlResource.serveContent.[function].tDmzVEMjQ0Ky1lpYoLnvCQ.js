function (res) {
    res.type('html');
    return res.send(this.content);
}