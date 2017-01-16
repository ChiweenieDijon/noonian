function (typeDesc) {
    if(typeDesc.regex) {
        return {
            validator:'matches',
            arguments: [typeDesc.regex, typeDesc.regex_modifiers],
            message: '$regex-mismatch'
        }
    }
    
    return null;
}