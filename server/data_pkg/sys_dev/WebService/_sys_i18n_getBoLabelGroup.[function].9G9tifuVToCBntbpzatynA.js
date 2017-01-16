function (req, queryParams, I18n) {
    
    return I18n.getBoLabelGroup(queryParams.className, req.user).then(function(fieldLabels) {
        return {result:fieldLabels};
    });
    
}