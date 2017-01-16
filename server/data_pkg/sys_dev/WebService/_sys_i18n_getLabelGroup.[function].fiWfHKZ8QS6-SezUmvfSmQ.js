function (req, queryParams, I18n) {
    
    return I18n.getLabelGroup(queryParams.key, req.user).then(function(lg) {
        return {result:lg};
    });
    
}