function (res) {
    res.type('css');
    return res.send(this.content);
}